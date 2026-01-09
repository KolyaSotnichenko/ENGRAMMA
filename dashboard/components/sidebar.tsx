'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122"
          />
        </svg>
      ),
    },
    {
      label: 'Memories',
      path: '/memories',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
          />
        </svg>
      ),
    },
    {
      label: 'Timeline',
      path: '/timeline',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      ),
    },
    {
      label: 'Graph',
      path: '/graph',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49M18 8v8"
          />
        </svg>
      ),
    },
    {
      label: 'Decay Monitor',
      path: '/decay',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
          />
        </svg>
      ),
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      ),
    },
    {
      label: 'Docs',
      path: '/docs',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h8.25A2.25 2.25 0 0 1 16.5 6.75v12.75A2.25 2.25 0 0 1 14.25 21H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 8.25h4.5M9 11.25h4.5M9 14.25h3"
          />
        </svg>
      ),
    },
  ];

  return (
    <aside className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-stone-400">
      <div className="bg-stone-950/80 backdrop-blur-md border border-stone-800 rounded-full p-2 flex items-center gap-2 shadow-2xl">
        {/* <div className="flex items-center gap-1 px-2">
          <div className="relative group">
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-stone-800 text-stone-200 px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Engramma
            </span>
            <Link href="/" className="block">
              <Image
                src="/favicon.ico"
                alt="logo"
                width={32}
                height={32}
                className="rounded-lg hover:opacity-80 transition-opacity"
              />
            </Link>
          </div>
          <div className="w-px h-8 bg-stone-800 mx-2" />
        </div> */}

        <div className="flex items-center gap-1">
          {navItems.map((item) => (
            <div key={item.path} className="relative group">
              <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-stone-800 text-stone-200 px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {item.label}
              </span>
              <Link href={item.path}>
                <button
                  className={`rounded-full p-2.5 transition-all duration-300 ${
                    pathname === item.path
                      ? 'bg-stone-800 text-stone-100 shadow-lg scale-110'
                      : 'hover:bg-stone-900 hover:text-stone-200 hover:scale-105'
                  }`}
                >
                  {item.icon}
                </button>
              </Link>
            </div>
          ))}
        </div>

        {/* <div className="flex items-center gap-1 px-2">
          <div className="w-px h-8 bg-stone-800 mx-2" />
          <div className="relative group">
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-stone-800 text-stone-200 px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Profile
            </span>
            <button className="rounded-full hover:opacity-80 transition-opacity">
              <Image
                src="/favicon.ico"
                alt="pfp"
                width={32}
                height={32}
                className="rounded-full border border-stone-800"
              />
            </button>
          </div>
        </div> */}
      </div>
    </aside>
  );
}
