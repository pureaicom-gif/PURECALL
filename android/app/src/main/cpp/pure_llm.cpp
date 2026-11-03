// PURE on-device LLM: minimal JNI wrapper around llama.cpp (chat template + streaming sampling).
#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <atomic>
#include "llama.h"
#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "PureLLM", __VA_ARGS__)

struct Engine { llama_model *model = nullptr; llama_context *ctx = nullptr; int nCtx = 2048; std::atomic<bool> stop{false}; };

static std::string jstr(JNIEnv *env, jstring s) { if (!s) return ""; const char *c = env->GetStringUTFChars(s, nullptr); std::string r(c); env->ReleaseStringUTFChars(s, c); return r; }
static std::string jbytes(JNIEnv *env, jbyteArray a) { jsize n = env->GetArrayLength(a); std::string r(n, '\0'); env->GetByteArrayRegion(a, 0, n, (jbyte *)r.data()); return r; }
// length of the longest prefix of s that is complete UTF-8
static size_t utf8Complete(const std::string &s) {
  size_t i = s.size(), back = 0;
  while (i > 0 && back < 4) { unsigned char c = s[i - 1]; if ((c & 0xC0) != 0x80) { size_t need = c < 0x80 ? 1 : (c >> 5) == 6 ? 2 : (c >> 4) == 14 ? 3 : (c >> 3) == 30 ? 4 : 1; return back + 1 >= need ? s.size() : i - 1; } --i; ++back; }
  return s.size();
}

extern "C" JNIEXPORT jlong JNICALL Java_app_pure_chat_LocalLlm_nativeLoad(JNIEnv *env, jclass, jstring path, jint nCtx, jint threads) {
  llama_backend_init();
  auto mp = llama_model_default_params();
  llama_model *model = llama_model_load_from_file(jstr(env, path).c_str(), mp);
  if (!model) return 0;
  auto cp = llama_context_default_params(); cp.n_ctx = nCtx; cp.n_batch = 512; cp.n_threads = threads; cp.n_threads_batch = threads;
  llama_context *ctx = llama_init_from_model(model, cp);
  if (!ctx) { llama_model_free(model); return 0; }
  auto *e = new Engine(); e->model = model; e->ctx = ctx; e->nCtx = nCtx; LOG("model loaded ctx=%d threads=%d", nCtx, threads);
  return (jlong)e;
}

extern "C" JNIEXPORT void JNICALL Java_app_pure_chat_LocalLlm_nativeFree(JNIEnv *, jclass, jlong h) {
  auto *e = (Engine *)h; if (!e) return; llama_free(e->ctx); llama_model_free(e->model); delete e;
}
extern "C" JNIEXPORT void JNICALL Java_app_pure_chat_LocalLlm_nativeStop(JNIEnv *, jclass, jlong h) { auto *e = (Engine *)h; if (e) e->stop = true; }

// roles/contents are UTF-8 byte arrays; callback.onBytes(byte[]) returns false to stop. Returns error string or null.
extern "C" JNIEXPORT jstring JNICALL Java_app_pure_chat_LocalLlm_nativeGenerate(JNIEnv *env, jclass, jlong h, jobjectArray roles, jobjectArray contents, jint maxTokens, jfloat temp, jobject cb) {
  auto *e = (Engine *)h; if (!e) return env->NewStringUTF("not loaded");
  e->stop = false;
  jmethodID onBytes = env->GetMethodID(env->GetObjectClass(cb), "onBytes", "([B)Z");
  const llama_vocab *vocab = llama_model_get_vocab(e->model);
  int n = env->GetArrayLength(roles);
  std::vector<std::string> rs(n), cs(n); std::vector<llama_chat_message> msgs(n);
  for (int i = 0; i < n; i++) { rs[i] = jbytes(env, (jbyteArray)env->GetObjectArrayElement(roles, i)); cs[i] = jbytes(env, (jbyteArray)env->GetObjectArrayElement(contents, i)); msgs[i] = {rs[i].c_str(), cs[i].c_str()}; }
  const char *tmpl = llama_model_chat_template(e->model, nullptr);
  std::vector<char> buf(16384);
  int len = llama_chat_apply_template(tmpl, msgs.data(), n, true, buf.data(), buf.size());
  if (len > (int)buf.size()) { buf.resize(len + 1); len = llama_chat_apply_template(tmpl, msgs.data(), n, true, buf.data(), buf.size()); }
  if (len < 0) return env->NewStringUTF("chat template failed");
  std::string prompt(buf.data(), len);
  int nTok = -llama_tokenize(vocab, prompt.c_str(), prompt.size(), nullptr, 0, true, true);
  std::vector<llama_token> toks(nTok);
  if (llama_tokenize(vocab, prompt.c_str(), prompt.size(), toks.data(), nTok, true, true) < 0) return env->NewStringUTF("tokenize failed");
  if (nTok + maxTokens > e->nCtx) { if (nTok >= e->nCtx - 16) return env->NewStringUTF("prompt too long"); maxTokens = e->nCtx - nTok - 1; }
  llama_memory_clear(llama_get_memory(e->ctx), true);
  auto sp = llama_sampler_chain_default_params();
  llama_sampler *smpl = llama_sampler_chain_init(sp);
  if (temp <= 0.01f) llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
  else { llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40)); llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.9f, 1)); llama_sampler_chain_add(smpl, llama_sampler_init_temp(temp)); llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED)); }
  // prompt in n_batch chunks
  const char *err = nullptr;
  for (int i = 0; i < nTok && !err; i += 512) { int m = std::min(512, nTok - i); if (llama_decode(e->ctx, llama_batch_get_one(toks.data() + i, m))) err = "decode failed"; }
  std::string pending; char piece[256];
  for (int i = 0; i < maxTokens && !err && !e->stop; i++) {
    llama_token t = llama_sampler_sample(smpl, e->ctx, -1);
    if (llama_vocab_is_eog(vocab, t)) break;
    int pl = llama_token_to_piece(vocab, t, piece, sizeof piece, 0, false);
    if (pl > 0) pending.append(piece, pl);
    size_t ok = utf8Complete(pending);
    if (ok > 0) {
      jbyteArray arr = env->NewByteArray(ok); env->SetByteArrayRegion(arr, 0, ok, (const jbyte *)pending.data());
      jboolean more = env->CallBooleanMethod(cb, onBytes, arr); env->DeleteLocalRef(arr); pending.erase(0, ok);
      if (!more) break;
    }
    if (llama_decode(e->ctx, llama_batch_get_one(&t, 1))) err = "decode failed";
  }
  llama_sampler_free(smpl);
  return err ? env->NewStringUTF(err) : nullptr;
}
