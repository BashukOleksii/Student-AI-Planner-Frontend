interface PasswordResetLink {
  email: string
  token: string
}

// One-use handoff from URL cleanup to the view. Never put this value in router state or Pinia.
let pendingLink: PasswordResetLink | null = null

export function capturePasswordResetLink(query: Record<string, unknown>) {
  const { email, token } = query
  pendingLink =
    typeof email === 'string' && email.trim() && typeof token === 'string' && token.trim()
      ? { email, token }
      : null
}

export function prepareInitialPasswordResetLink() {
  if (window.location.pathname !== `${import.meta.env.BASE_URL}reset-password`) return
  const query = new URLSearchParams(window.location.search)
  // Reject duplicate values rather than choosing an ambiguous email or token.
  capturePasswordResetLink({
    email: query.getAll('email').length === 1 ? query.get('email') : null,
    token: query.getAll('token').length === 1 ? query.get('token') : null,
  })
  // Run before createWebHistory and authentication bootstrap, including on malformed links.
  window.history.replaceState(null, '', window.location.pathname)
}

export function takePasswordResetLink() {
  const link = pendingLink
  pendingLink = null
  return link
}

export function clearPasswordResetLink() {
  pendingLink = null
}
