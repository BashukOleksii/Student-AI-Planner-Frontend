// Kept independent of date/presentation modules: auth only needs intent cleanup.
export function validMessage(content: string) {
  return (
    Array.from(content).length <= 4000 &&
    !/^[\s\p{Z}\p{C}]*$/u.test(content) &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content) &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content)
  )
}
