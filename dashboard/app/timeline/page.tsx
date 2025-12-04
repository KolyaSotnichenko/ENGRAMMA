'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL, getHeaders } from '@/lib/api';

import { sectorColors } from '@/lib/colors';

interface event {
  id: string;
  time: number;
  type: 'create' | 'update' | 'decay' | 'reflect';
  title: string;
  desc: string;
  sector: string;
  salience?: number;
}

const typeIcons = {
  create: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path
        fillRule="evenodd"
        d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  ),
  update: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
      <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
    </svg>
  ),
  decay: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path
        fillRule="evenodd"
        d="M11.47 2.47a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 1 1-1.06 1.06l-6.22-6.22V21a.75.75 0 0 1-1.5 0V4.81l-6.22 6.22a.75.75 0 1 1-1.06-1.06l7.5-7.5Z"
        clipRule="evenodd"
        transform="rotate(180 12 12)"
      />
    </svg>
  ),
  reflect: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path
        fillRule="evenodd"
        d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

export default function timeline() {
  const [filter, setfilter] = useState('all');
  const [search, setSearch] = useState('');
  const [events, setevents] = useState<event[]>([]);
  const [loading, setloading] = useState(true);
  const [error, seterror] = useState<string | null>(null);
  const [limit, setlimit] = useState(50);

  useEffect(() => {
    fetchactivity();
  }, [limit]);

  async function fetchactivity() {
    setloading(true);
    seterror(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/dashboard/activity?limit=${limit}`,
        { headers: getHeaders() },
      );
      if (!res.ok) throw new Error('failed to fetch activity');
      const data = await res.json();

      const mapped = (data.activities || []).map((a: any) => ({
        id: a.id,
        time: a.timestamp,
        type: determineType(a),
        title: getTitle(a),
        desc: a.content || 'No description',
        sector: a.sector,
        salience: a.salience,
      }));
      setevents(mapped);
    } catch (e: any) {
      seterror(e.message);
    } finally {
      setloading(false);
    }
  }

  function determineType(
    activity: any,
  ): 'create' | 'update' | 'decay' | 'reflect' {
    if (activity.salience < 0.3) return 'decay';
    if (activity.sector === 'reflective') return 'reflect';
    if (activity.type === 'memory_updated') return 'update';
    return 'create';
  }

  function getTitle(activity: any): string {
    if (activity.salience < 0.3) return 'salience decay';
    if (activity.sector === 'reflective') return 'reflection generated';
    if (activity.type === 'memory_updated') return 'memory updated';
    return 'memory created';
  }

  const filtered = events.filter((e) => {
    const matchesType = filter === 'all' || e.type === filter;
    const matchesSearch =
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.desc.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const typeStyles = {
    create: {
      bg: 'bg-emerald-500',
      text: 'text-emerald-950',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    update: {
      bg: 'bg-sky-500',
      text: 'text-sky-950',
      badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    },
    decay: {
      bg: 'bg-amber-500',
      text: 'text-amber-950',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    reflect: {
      bg: 'bg-purple-500',
      text: 'text-purple-950',
      badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    },
  };

  const formattime = (ts: number) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="min-h-screen text-stone-200 p-6" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sidebar (Sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-28 space-y-6">
            <h1 className="text-2xl font-light tracking-tight text-white">
              Timeline
            </h1>

            {/* Search */}
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="absolute left-3 top-2.5 size-5 text-stone-500"
              >
                <path
                  fillRule="evenodd"
                  d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                type="text"
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-stone-900/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-white/20 focus:bg-stone-900 transition-all"
              />
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-stone-400 ml-1">
                Filter by Type
              </h3>
              <div className="flex flex-wrap gap-2">
                {['all', 'create', 'update', 'decay', 'reflect'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setfilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                      filter === t
                        ? 'bg-white text-black border-white'
                        : 'bg-stone-900/50 text-stone-400 border-white/10 hover:border-white/20 hover:text-stone-300'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="pt-4 border-t border-white/5 flex items-center gap-3">
              <select
                value={limit}
                onChange={(e) => setlimit(parseInt(e.target.value))}
                className="bg-stone-900/50 rounded-lg border border-white/10 outline-none p-2 text-sm text-stone-400 focus:border-white/20 transition-colors flex-1"
              >
                <option value={25}>25 items</option>
                <option value={50}>50 items</option>
                <option value={100}>100 items</option>
              </select>
              <button
                onClick={fetchactivity}
                className="p-2 rounded-lg bg-stone-900/50 border border-white/10 hover:bg-stone-800 text-stone-400 transition-colors"
                title="Refresh"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="lg:col-span-3">
          <div className="bg-stone-950/30 border border-white/5 rounded-2xl p-6 min-h-[80vh]">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-light text-white">Events</h2>
              <span className="text-sm text-stone-500">
                {filtered.length} found
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : (
              <div className="relative space-y-8 before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-stone-800 before:to-transparent">
                {filtered.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                  >
                    {/* Icon */}
                    <div
                      className={`flex items-center justify-center w-12 h-12 rounded-full border-4 border-stone-950 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
                        typeStyles[item.type].bg
                      } ${typeStyles[item.type].text} z-10 relative`}
                    >
                      {typeIcons[item.type]}
                    </div>

                    {/* Content Card */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                            typeStyles[item.type].badge
                          }`}
                        >
                          {item.type}
                        </span>
                        <time className="text-xs text-stone-500 font-mono">
                          {formattime(item.time)}
                        </time>
                      </div>
                      <h3 className="text-lg font-semibold text-stone-100 mb-1 leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-sm text-stone-400 leading-relaxed">
                        {item.desc}
                      </p>
                      {item.sector && (
                        <div className="mt-3 flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full`}
                            style={{
                              backgroundColor:
                                (sectorColors as Record<string, string>)[
                                  item.sector
                                ] || '#78716c',
                            }}
                          />
                          <span className="text-xs text-stone-500 uppercase tracking-wider">
                            {item.sector}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-20 text-stone-500">
                No events found matching your criteria.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
