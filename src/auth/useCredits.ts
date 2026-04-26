import { useState, useEffect, useCallback } from 'react'

const DAILY_LIMIT = 100

interface CreditsState {
    remaining: number
    lastReset: string // ISO date string YYYY-MM-DD
}

function getStorageKey(userId: string) {
    return `open-news-credits-${userId}`
}

function getTodayStr() {
    return new Date().toISOString().slice(0, 10)
}

function getInitialState(userId: string): CreditsState {
    try {
        const raw = localStorage.getItem(getStorageKey(userId))
        if (raw) {
            const parsed = JSON.parse(raw) as CreditsState
            if (parsed.lastReset === getTodayStr()) {
                return parsed
            }
        }
    } catch { /* ignore */ }
    return { remaining: DAILY_LIMIT, lastReset: getTodayStr() }
}

export function useCredits(userId: string | undefined) {
    const [credits, setCredits] = useState<number>(() => {
        if (!userId) return DAILY_LIMIT
        return getInitialState(userId).remaining
    })

    // Sync on mount & when userId changes
    useEffect(() => {
        if (!userId) {
            const t = setTimeout(() => setCredits(DAILY_LIMIT), 0)
            return () => clearTimeout(t)
        }
        const state = getInitialState(userId)
        const t = setTimeout(() => setCredits(state.remaining), 0)
        localStorage.setItem(getStorageKey(userId), JSON.stringify(state))
        return () => clearTimeout(t)
    }, [userId])

    const consume = useCallback((amount = 1): boolean => {
        if (!userId) return false
        try {
            const state = getInitialState(userId)
            if (state.remaining < amount) return false
            const next = { remaining: state.remaining - amount, lastReset: state.lastReset }
            setCredits(next.remaining)
            localStorage.setItem(getStorageKey(userId), JSON.stringify(next))
            return true
        } catch {
            // If localStorage fails (e.g., disabled, full, incognito), fall back to in-memory only
            setCredits(prev => {
                const next = Math.max(0, prev - amount)
                return next
            })
            return true
        }
    }, [userId])

    const reset = useCallback(() => {
        if (!userId) return
        const next = { remaining: DAILY_LIMIT, lastReset: getTodayStr() }
        setCredits(next.remaining)
        localStorage.setItem(getStorageKey(userId), JSON.stringify(next))
    }, [userId])

    return { credits, consume, reset, limit: DAILY_LIMIT }
}
