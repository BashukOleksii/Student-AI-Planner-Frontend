export function resetLinkFromLog(log: string, recipient: string): string | undefined {
  const text = log
    .replace(/=\r?\n/g, '')
    .replaceAll('=3D', '=')
    .replaceAll('&amp;', '&')
  const links = text.match(/http:\/\/localhost:15173\/reset-password\?[^\s<>"')]+/g) ?? []
  return links.find((link) => {
    const url = new URL(link)
    return (
      url.searchParams.get('email') === recipient &&
      /^[a-f0-9]{64}$/.test(url.searchParams.get('token') ?? '')
    )
  })
}
