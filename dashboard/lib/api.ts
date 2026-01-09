export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

const TOKEN_KEY = 'engramma_auth_token'

export const getAuthToken = () => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(TOKEN_KEY)
}

export const setAuthToken = (token: string | null) => {
    if (typeof window === 'undefined') return
    if (!token) window.localStorage.removeItem(TOKEN_KEY)
    else window.localStorage.setItem(TOKEN_KEY, token)
}

export const getHeaders = () => {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY
    const token = getAuthToken()
    return {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
        ...(token && { Authorization: `Bearer ${token}` }),
    }
}
