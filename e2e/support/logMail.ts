/** Read only the synthetic recipient's reset URL; never print the captured mail. */
export function resetLinkFromLog(log: string, recipient: string): string | undefined {
  // Symfony's log transport includes decoded text and HTML parts. Decode only
  // explicit quoted-printable equals, not a raw '=12' prefix of a hex token.
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
