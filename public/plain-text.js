// ล้างสัญลักษณ์ markdown ให้เป็นข้อความธรรมดา (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และหน้าบ้าน)
export function plainText(input) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/^[ \t]{0,3}([-*_][ \t]*){3,}$/gm, '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*{2,}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
