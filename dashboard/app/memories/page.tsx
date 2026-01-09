"use client"

import { useState, useEffect } from "react"
import { API_BASE_URL, getHeaders } from "@/lib/api"

interface mem {
    id: string
    content: string
    primary_sector: string
    tags: string[]
    metadata?: any
    created_at: number
    updated_at?: number
    last_seen_at?: number
    salience: number
    decay_lambda?: number
    version?: number
}

const sectorColors: Record<string, string> = {
    semantic: "sky",
    episodic: "amber",
    procedural: "emerald",
    emotional: "rose",
    reflective: "purple"
}

export default function memories() {
    const [mems, setmems] = useState<mem[]>([])
    const [srch, setsrch] = useState("")
    const [filt, setfilt] = useState("all")
    const [loading, setloading] = useState(false)
    const [error, seterror] = useState<string | null>(null)
    const [page, setpage] = useState(1)
    const [showAddModal, setShowAddModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [editingMem, setEditingMem] = useState<mem | null>(null)
    const [deletingMemId, setDeletingMemId] = useState<string | null>(null)

    const limit = 1000

    useEffect(() => {
        fetchMems()
    }, [page, filt])

    async function fetchMems() {
        setloading(true)
        seterror(null)
        try {
            const offset = (page - 1) * limit
            const url = filt !== "all"
                ? `${API_BASE_URL}/memory/all?l=${limit}&u=${offset}&sector=${filt}`
                : `${API_BASE_URL}/memory/all?l=${limit}&u=${offset}`
            const res = await fetch(url, { headers: getHeaders() })
            if (!res.ok) throw new Error('failed to fetch memories')
            const data = await res.json()
            setmems(data.items || [])
        } catch (e: any) {
            seterror(e.message)
        } finally {
            setloading(false)
        }
    }

    async function handleSearch() {
        if (!srch.trim()) {
            fetchMems()
            return
        }
        setloading(true)
        seterror(null)
        try {
            const res = await fetch(`${API_BASE_URL}/memory/query`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    query: srch,
                    k: 1000,
                    filters: filt !== "all" ? { sector: filt } : undefined,
                }),
            })
            if (!res.ok) throw new Error('search failed')
            const data = await res.json()
            setmems(
                (data.matches || []).map((m: any) => ({
                    id: m.id,
                    content: m.content,
                    primary_sector: m.primary_sector,
                    tags: [],
                    created_at: m.last_seen_at || Date.now(),
                    salience: m.salience,
                }))
            )
        } catch (e: any) {
            seterror(e.message)
        } finally {
            setloading(false)
        }
    }

    async function handleAddMemory(content: string, sector: string, tags: string) {
        try {
            const res = await fetch(`${API_BASE_URL}/memory/add`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    content,
                    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
                    metadata: { primary_sector: sector },
                }),
            })
            if (!res.ok) throw new Error('failed to add memory')
            setShowAddModal(false)
            fetchMems()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    async function handleEditMemory(id: string, content: string, tags: string) {
        try {
            const res = await fetch(`${API_BASE_URL}/memory/${id}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({
                    content,
                    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
                }),
            })
            if (!res.ok) throw new Error('failed to update memory')
            setShowEditModal(false)
            setEditingMem(null)
            fetchMems()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    async function handleDeleteMemory(id: string) {
        try {
            const res = await fetch(`${API_BASE_URL}/memory/${id}`, {
                method: 'DELETE',
                headers: getHeaders(),
            })
            if (!res.ok) throw new Error('failed to delete memory')
            setShowDeleteModal(false)
            setDeletingMemId(null)
            fetchMems()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    const filteredMems = mems.filter(m => {
        const matchesSearch = !srch || m.content.toLowerCase().includes(srch.toLowerCase())
        return matchesSearch
    })

    const sectorCounts = mems.reduce((acc, m) => {
        acc[m.primary_sector] = (acc[m.primary_sector] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    return (
        <div className="min-h-screen pb-32 max-w-7xl mx-auto space-y-8" suppressHydrationWarning>
            {/* Header */}
            <div className="flex flex-col gap-1 pt-6">
                <h1 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-stone-200 to-stone-500">
                    Memories
                </h1>
                <p className="text-stone-400 text-lg">
                    Browse and manage your neural knowledge base.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8" suppressHydrationWarning>
                {/* Main Content */}
                <div className="lg:col-span-3 space-y-6">
                    {loading && (
                         <div className="flex flex-col items-center justify-center py-20 space-y-4 text-stone-500 animate-pulse">
                            <div className="w-12 h-12 rounded-full border-2 border-stone-800 border-t-stone-500 animate-spin" />
                            <p className="text-sm">Retrieving memories...</p>
                        </div>
                    )}
                    
                    {error && (
                        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/30 text-rose-400 text-sm text-center">
                            Error: {error}
                        </div>
                    )}

                    {!loading && !error && filteredMems.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-32 text-stone-500 border border-dashed border-stone-800 rounded-3xl bg-stone-900/20">
                            <div className="p-4 rounded-full bg-stone-900/50 mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-8 opacity-40"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
                            </div>
                            <p className="font-medium text-stone-400">No memories found</p>
                            <p className="text-sm opacity-60 mt-1">Try adjusting filters or add a new one</p>
                        </div>
                    )}

                    {!loading && !error && (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredMems.map((mem) => (
                                <div
                                    key={mem.id}
                                    className="group relative rounded-2xl p-5 bg-stone-900/20 border border-white/5 hover:bg-stone-900/40 hover:border-white/10 hover:shadow-lg transition-all duration-300 backdrop-blur-sm"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`shrink-0 mt-1.5 w-2 h-2 rounded-full bg-${sectorColors[mem.primary_sector]}-500 shadow-[0_0_8px_rgba(var(--${sectorColors[mem.primary_sector]}-500-rgb),0.5)]`} />
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <p className="text-stone-200 text-sm leading-relaxed font-medium line-clamp-3 group-hover:line-clamp-none transition-all">
                                                    {mem.content}
                                                </p>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => { setEditingMem(mem); setShowEditModal(true) }}
                                                        className="p-2 rounded-lg text-stone-500 hover:text-stone-200 hover:bg-white/5 transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" /><path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => { setDeletingMemId(mem.id); setShowDeleteModal(true) }}
                                                        className="p-2 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4"><path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clipRule="evenodd" /></svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/5">
                                                    <span className="capitalize text-stone-300 font-medium">{mem.primary_sector}</span>
                                                </div>
                                                
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/5">
                                                    <span>Salience</span>
                                                    <span className={`font-mono font-bold ${mem.salience > 0.7 ? 'text-emerald-400' : 'text-stone-400'}`}>
                                                        {(mem.salience * 100).toFixed(0)}%
                                                    </span>
                                                </div>

                                                <span className="font-mono text-stone-600 px-1">{new Date(mem.created_at).toLocaleDateString()}</span>

                                                {mem.tags?.length > 0 && (
                                                    <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                                                        {mem.tags.map(tag => (
                                                            <span key={tag} className="text-stone-500 hover:text-stone-300 transition-colors">#{tag}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && !error && filteredMems.length >= limit && (
                        <div className="flex justify-center items-center gap-4 pt-6">
                            <button
                                onClick={() => setpage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-sm transition-colors"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-stone-500 font-mono">Page {page}</span>
                            <button
                                onClick={() => setpage(p => p + 1)}
                                disabled={filteredMems.length < limit}
                                className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-sm transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="sticky top-24 space-y-6">
                        {/* Search & Add */}
                        <div className="p-5 rounded-2xl bg-stone-900/20 border border-white/5 backdrop-blur-sm space-y-4">
                            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Actions</h3>
                            <div className="relative group">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-stone-300 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                                <input
                                    type="text"
                                    value={srch}
                                    onChange={(e) => setsrch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="w-full bg-black/20 hover:bg-black/40 focus:bg-black/40 rounded-xl border border-white/5 focus:border-stone-700 outline-none py-2.5 pl-10 pr-3 text-sm text-stone-200 transition-all placeholder:text-stone-600"
                                    placeholder="Search memories..."
                                />
                            </div>
                             <button
                                onClick={() => setShowAddModal(true)}
                                className="w-full rounded-xl py-2.5 bg-stone-100 hover:bg-white text-stone-950 text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-stone-950/50 hover:scale-[1.02] active:scale-[0.98]"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4"><path fillRule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /></svg>
                                Add New Memory
                            </button>
                        </div>

                        {/* Filters */}
                        <div className="p-5 rounded-2xl bg-stone-900/20 border border-white/5 backdrop-blur-sm space-y-4">
                            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Filter by Sector</h3>
                            <div className="flex flex-col gap-1">
                                {['all', 'semantic', 'episodic', 'procedural', 'emotional', 'reflective'].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => { setfilt(s); setpage(1) }}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-left flex items-center justify-between group ${
                                            filt === s
                                                ? 'bg-stone-800 text-white shadow-sm'
                                                : 'text-stone-500 hover:bg-white/5 hover:text-stone-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {s !== 'all' && (
                                                <span 
                                                    className={`w-2 h-2 rounded-full transition-transform group-hover:scale-110 ${filt === s ? 'scale-110' : ''}`}
                                                    style={{ backgroundColor: (sectorColors as any)[s] || '#666' }}
                                                />
                                            )}
                                            <span className="capitalize">{s}</span>
                                        </div>
                                        {filt === s && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="p-5 rounded-2xl bg-stone-900/20 border border-white/5 backdrop-blur-sm space-y-4">
                            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Distribution</h3>
                            <div className="space-y-3">
                                {Object.entries(sectorCounts).map(([sector, count]) => (
                                    <div key={sector} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (sectorColors as any)[sector] }} />
                                            <span className="text-stone-400 capitalize">{sector}</span>
                                        </div>
                                        <span className="font-mono text-stone-500">{count}</span>
                                    </div>
                                ))}
                                <div className="h-px bg-white/5 my-2" />
                                <div className="flex items-center justify-between text-sm pt-1">
                                    <span className="text-stone-300 font-medium">Total</span>
                                    <span className="font-mono text-stone-200 font-bold">{mems.length}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showAddModal && <AddMemoryModal onClose={() => setShowAddModal(false)} onAdd={handleAddMemory} />}

            {showEditModal && editingMem && (
                <EditMemoryModal
                    mem={editingMem}
                    onClose={() => { setShowEditModal(false); setEditingMem(null) }}
                    onEdit={handleEditMemory}
                />
            )}

            {showDeleteModal && deletingMemId && (
                <DeleteConfirmModal
                    onClose={() => { setShowDeleteModal(false); setDeletingMemId(null) }}
                    onConfirm={() => handleDeleteMemory(deletingMemId)}
                />
            )}
        </div>
    )
}

function AddMemoryModal({ onClose, onAdd }: { onClose: () => void; onAdd: (content: string, sector: string, tags: string) => void }) {
    const [content, setContent] = useState('')
    const [sector, setSector] = useState('semantic')
    const [tags, setTags] = useState('')

    return (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900/90 backdrop-blur-xl rounded-2xl p-6 max-w-2xl w-full border border-stone-800 shadow-2xl shadow-black/50">
                <h2 className="text-xl font-semibold text-stone-100 mb-6 tracking-tight">Add New Memory</h2>
                <div className="space-y-5">
                    <div>
                        <label className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2 block">Content</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full bg-stone-950/50 rounded-xl border border-stone-800 focus:border-stone-600 outline-none p-4 text-stone-200 min-h-32 transition-colors placeholder:text-stone-700 resize-none"
                            placeholder="What's on your mind?"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2 block">Sector</label>
                            <div className="relative">
                                <select
                                    value={sector}
                                    onChange={(e) => setSector(e.target.value)}
                                    className="w-full bg-stone-950/50 rounded-xl border border-stone-800 focus:border-stone-600 outline-none p-3 pr-10 text-stone-200 appearance-none transition-colors cursor-pointer"
                                >
                                    <option value="semantic">Semantic</option>
                                    <option value="episodic">Episodic</option>
                                    <option value="procedural">Procedural</option>
                                    <option value="emotional">Emotional</option>
                                    <option value="reflective">Reflective</option>
                                </select>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                            </div>
                        </div>
                        <div>
                            <label className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2 block">Tags</label>
                            <input
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                className="w-full bg-stone-950/50 rounded-xl border border-stone-800 focus:border-stone-600 outline-none p-3 text-stone-200 transition-colors placeholder:text-stone-700"
                                placeholder="comma, separated, tags"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-stone-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onAdd(content, sector, tags)}
                        disabled={!content.trim()}
                        className="px-4 py-2 rounded-lg bg-stone-100 hover:bg-white text-stone-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-lg shadow-stone-950/20"
                    >
                        Add Memory
                    </button>
                </div>
            </div>
        </div>
    )
}

function EditMemoryModal({ mem, onClose, onEdit }: { mem: mem; onClose: () => void; onEdit: (id: string, content: string, tags: string) => void }) {
    const [content, setContent] = useState(mem.content)
    const [tags, setTags] = useState(mem.tags?.join(', ') || '')

    return (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900/90 backdrop-blur-xl rounded-2xl p-6 max-w-2xl w-full border border-stone-800 shadow-2xl shadow-black/50">
                <h2 className="text-xl font-semibold text-stone-100 mb-6 tracking-tight">Edit Memory</h2>
                <div className="space-y-5">
                    <div>
                        <label className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2 block">Content</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full bg-stone-950/50 rounded-xl border border-stone-800 focus:border-stone-600 outline-none p-4 text-stone-200 min-h-32 transition-colors resize-none"
                        />
                    </div>
                    <div>
                        <label className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-2 block">Tags</label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full bg-stone-950/50 rounded-xl border border-stone-800 focus:border-stone-600 outline-none p-3 text-stone-200 transition-colors placeholder:text-stone-700"
                            placeholder="comma, separated, tags"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-stone-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onEdit(mem.id, content, tags)}
                        disabled={!content.trim()}
                        className="px-4 py-2 rounded-lg bg-stone-100 hover:bg-white text-stone-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-lg shadow-stone-950/20"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}

function DeleteConfirmModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
    return (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900/90 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full border border-stone-800 shadow-2xl shadow-black/50">
                <h2 className="text-xl font-semibold text-stone-100 mb-3 tracking-tight">Delete Memory</h2>
                <p className="text-stone-400 text-sm leading-relaxed mb-8">
                    Are you sure you want to delete this memory? This action cannot be undone and will remove it from your knowledge base permanently.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-900/20 transition-colors text-sm font-medium"
                    >
                        Delete Memory
                    </button>
                </div>
            </div>
        </div>
    )
}
