"use client"

import { useEffect, useState } from "react"
import { API_BASE_URL, getHeaders } from "@/lib/api"

type ReminderStatus = "scheduled" | "completed" | "cancelled"

type Reminder = {
  id: string
  user_id: string | null
  content: string
  due_at: number
  timezone: string | null
  repeat_every_ms: number | null
  cooldown_ms: number | null
  status: ReminderStatus
  tags: string[]
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  last_triggered_at: number | null
  completed_at: number | null
  cancelled_at: number | null
}

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>([])
  const [status, setStatus] = useState<ReminderStatus>("scheduled")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [userId, setUserId] = useState("")
  const [userIds, setUserIds] = useState<string[]>([])

  const statusPill = (s: ReminderStatus) => {
    if (s === "scheduled") return "bg-sky-500/10 border-sky-500/20 text-sky-300"
    if (s === "completed") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
    return "bg-stone-500/10 border-stone-500/20 text-stone-300"
  }

  async function fetchReminders() {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`${API_BASE_URL}/reminders`)
      url.searchParams.set("status", status)
      url.searchParams.set("limit", "200")
      url.searchParams.set("offset", "0")
      if (userId.trim()) url.searchParams.set("user_id", userId.trim())

      const res = await fetch(url.toString(), { headers: getHeaders() })
      if (!res.ok) throw new Error("failed to fetch reminders")
      const data = await res.json()
      setItems((data.items || []) as Reminder[])
    } catch (e: any) {
      setError(e?.message || "failed")
    } finally {
      setLoading(false)
    }
  }

  async function fetchUserIds() {
    try {
      const url = new URL(`${API_BASE_URL}/reminders/users`)
      url.searchParams.set("status", status)
      const res = await fetch(url.toString(), { headers: getHeaders() })
      if (!res.ok) {
        setUserIds([])
        return
      }
      const data = await res.json()
      const ids = Array.isArray(data?.user_ids) ? (data.user_ids as string[]) : []
      setUserIds(ids)
    } catch {
      setUserIds([])
    }
  }

  useEffect(() => {
    fetchReminders()
  }, [status, userId])

  useEffect(() => {
    fetchUserIds()
  }, [status])

  async function completeReminder(id: string) {
    setError(null)
    try {
      const url = new URL(`${API_BASE_URL}/reminders/${id}/complete`)
      if (userId.trim()) url.searchParams.set("user_id", userId.trim())
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error("failed to complete reminder")
      await fetchReminders()
    } catch (e: any) {
      setError(e?.message || "failed")
    }
  }

  async function cancelReminder(id: string) {
    setError(null)
    try {
      const url = new URL(`${API_BASE_URL}/reminders/${id}/cancel`)
      if (userId.trim()) url.searchParams.set("user_id", userId.trim())
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error("failed to cancel reminder")
      await fetchReminders()
    } catch (e: any) {
      setError(e?.message || "failed")
    }
  }

  async function snoozeReminder(id: string, deltaMs: number) {
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/reminders/${id}/snooze`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          delta_ms: deltaMs,
          user_id: userId.trim() ? userId.trim() : undefined,
        }),
      })
      if (!res.ok) throw new Error("failed to snooze reminder")
      await fetchReminders()
    } catch (e: any) {
      setError(e?.message || "failed")
    }
  }

  async function deleteReminder(id: string) {
    setError(null)
    try {
      const url = new URL(`${API_BASE_URL}/reminders/${id}`)
      if (userId.trim()) url.searchParams.set("user_id", userId.trim())
      const res = await fetch(url.toString(), {
        method: "DELETE",
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error("failed to delete reminder")
      await fetchReminders()
    } catch (e: any) {
      setError(e?.message || "failed")
    }
  }

  return (
    <div className="min-h-screen pb-32 max-w-7xl mx-auto space-y-8" suppressHydrationWarning>
      <div className="flex flex-col gap-1 pt-6">
        <h1 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-stone-200 to-stone-500">
          Reminders
        </h1>
        <p className="text-stone-400 text-lg">
          Time-based items stored separately from memories.
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-stone-900/20 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div>
            <label className="block text-xs text-stone-500 mb-1">User</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-60 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-stone-200 outline-none focus:border-white/20"
            >
              <option value="">all users</option>
              {[...new Set([...(userIds || []), ...(userId ? [userId] : [])])].map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReminderStatus)}
              className="w-40 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-stone-200 outline-none focus:border-white/20"
            >
              <option value="scheduled">scheduled</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <button
            onClick={fetchReminders}
            className="md:ml-auto rounded-xl px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 text-stone-100 transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/30 text-rose-400 text-sm">
            Error: {error}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-stone-500 animate-pulse">
          <div className="w-12 h-12 rounded-full border-2 border-stone-800 border-t-stone-500 animate-spin" />
          <p className="text-sm">Loading reminders...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-stone-500 border border-dashed border-stone-800 rounded-3xl bg-stone-900/20">
              <p className="font-medium text-stone-400">No reminders</p>
              <p className="text-sm opacity-60 mt-1">No reminders for this filter</p>
            </div>
          ) : (
            items.map((r) => (
              <div
                key={r.id}
                className="group relative rounded-2xl p-5 bg-stone-900/20 border border-white/5 hover:bg-stone-900/40 hover:border-white/10 transition-all duration-300 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-1 rounded-full border ${statusPill(r.status)}`}>
                        {r.status}
                      </span>
                      {r.repeat_every_ms ? (
                        <span className="text-xs px-2 py-1 rounded-full border bg-purple-500/10 border-purple-500/20 text-purple-300">
                          recurring
                        </span>
                      ) : null}
                      {r.tags?.length ? (
                        <span className="text-xs text-stone-500">
                          {r.tags.map((t) => `#${t}`).join(" ")}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-stone-200 text-sm leading-relaxed font-medium">
                      {r.content}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                      <span className="font-mono">due: {new Date(r.due_at).toLocaleString()}</span>
                      {r.last_triggered_at ? (
                        <span className="font-mono">
                          last_triggered: {new Date(r.last_triggered_at).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {r.status === "scheduled" ? (
                      <>
                        <button
                          onClick={() => completeReminder(r.id)}
                          className="rounded-lg px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 text-sm"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => cancelReminder(r.id)}
                          className="rounded-lg px-3 py-1.5 bg-stone-500/10 hover:bg-stone-500/15 border border-stone-500/20 text-stone-200 text-sm"
                        >
                          Cancel
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => snoozeReminder(r.id, 5 * 60_000)}
                            className="rounded-lg px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 text-xs"
                          >
                            +5m
                          </button>
                          <button
                            onClick={() => snoozeReminder(r.id, 60 * 60_000)}
                            className="rounded-lg px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 text-xs"
                          >
                            +1h
                          </button>
                          <button
                            onClick={() => snoozeReminder(r.id, 24 * 60 * 60_000)}
                            className="rounded-lg px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 text-xs"
                          >
                            +1d
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={() => deleteReminder(r.id)}
                        className="rounded-lg px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-200 text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}