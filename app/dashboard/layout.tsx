"use client";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TopbarProvider, useTopbar } from "@/contexts/topbar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/dashboard/segov", label: "Proposições", icon: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" },
  { href: "/dashboard/requerimentos", label: "Requerimentos", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { href: "/dashboard/tags", label: "TAG", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
  { href: "/dashboard/sessoes", label: "Sessões & Pautas", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
];

const configItems = [
  { href: "/dashboard/vereadores", label: "Vereadores / Executivo", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/dashboard/comissoes", label: "Comissões", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { href: "/dashboard/analistas", label: "Analistas", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { href: "/dashboard/configuracoes", label: "Configurações Gerais", icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" },
];

const auditoriaItem = { href: "/dashboard/auditoria", label: "Auditoria", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" };
const backupItem = { href: "/dashboard/backup", label: "Backup", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 8h16M4 8a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2v-8a2 2 0 00-2-2M4 8V6a2 2 0 012-2h8l2 2h2a2 2 0 012 2v2" };

// Cores do tema executivo baseadas na logomarca
const SIDEBAR_BG = "linear-gradient(180deg, #0a0f1e 0%, #0f172a 60%, #111827 100%)";
const ACCENT_GRADIENT = "linear-gradient(135deg, #f97316 0%, #a855f7 100%)";
const BORDER_COLOR = "rgba(255,255,255,0.08)";
const NAV_INACTIVE = "rgba(255,255,255,0.55)";
const NAV_HOVER_BG = "rgba(255,255,255,0.07)";

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isAdmin = (session?.user as any)?.perfil === "admin";
  const configItemsVisiveis = isAdmin ? [...configItems, backupItem, auditoriaItem] : configItems;
  const [configAberto, setConfigAberto] = useState(
    configItemsVisiveis.some(i => pathname.startsWith(i.href))
  );

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (configItemsVisiveis.some(i => pathname.startsWith(i.href))) setConfigAberto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: "#a855f7", borderTopColor: "transparent" }} />
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  const configAtiva = configItemsVisiveis.some(i => pathname.startsWith(i.href));

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-16"} flex flex-col transition-all duration-300 flex-shrink-0 shadow-xl sticky top-0 h-screen`}
        style={{ background: SIDEBAR_BG }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              {/* Logo com gradiente da marca */}
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
                style={{ background: ACCENT_GRADIENT }}>
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-sm leading-tight">Legislativo</p>
                <p className="text-xs leading-tight" style={{ color: "#f97316" }}>Nova Lima</p>
              </div>
            </div>
          )}
          {!sidebarOpen && (
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto shadow"
              style={{ background: ACCENT_GRADIENT }}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
              </svg>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg transition ml-auto"
            style={{ color: NAV_INACTIVE }}
            onMouseEnter={e => (e.currentTarget.style.background = NAV_HOVER_BG)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Navegação */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto mt-2">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={active
                  ? { background: ACCENT_GRADIENT, color: "#fff", fontWeight: 600 }
                  : { color: NAV_INACTIVE }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = NAV_HOVER_BG; if (!active) e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; if (!active) e.currentTarget.style.color = NAV_INACTIVE; }}>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Configurações */}
        <div className="px-2 pb-1 pt-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          <button
            onClick={() => { if (sidebarOpen) setConfigAberto(v => !v); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
            style={configAtiva && !configAberto
              ? { background: ACCENT_GRADIENT, color: "#fff", fontWeight: 600 }
              : { color: NAV_INACTIVE }}
            onMouseEnter={e => { if (!configAtiva || configAberto) { e.currentTarget.style.background = NAV_HOVER_BG; e.currentTarget.style.color = "#fff"; } }}
            onMouseLeave={e => { if (!configAtiva || configAberto) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = NAV_INACTIVE; } }}>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Configurações</span>
                <svg className={`w-4 h-4 transition-transform ${configAberto ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
          {sidebarOpen && configAberto && (
            <div className="ml-3 mt-0.5 space-y-0.5 pl-2" style={{ borderLeft: `2px solid rgba(168,85,247,0.3)` }}>
              {configItemsVisiveis.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all"
                    style={active
                      ? { background: ACCENT_GRADIENT, color: "#fff", fontWeight: 600 }
                      : { color: NAV_INACTIVE }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = NAV_HOVER_BG; e.currentTarget.style.color = "#fff"; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = NAV_INACTIVE; } }}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 space-y-2" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
          {sidebarOpen && (
            <p className="text-xs px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Usuário:</span> {session?.user?.name}
            </p>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 text-xs transition w-full px-1"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {sidebarOpen && "Sair"}
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="bg-white shadow-sm px-5 py-2 flex items-center justify-between flex-shrink-0 sticky top-0 z-40">
          <TopbarLeft />
          <TopbarRight />
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              title="Atualizar sistema"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Atualizar
            </button>
          </div>
        </header>

        <main className="flex-1 px-5 pt-3 pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function TopbarLeft() {
  const { leftContent } = useTopbar()
  return <div className="flex-1 flex items-center">{leftContent}</div>
}

function TopbarRight() {
  const { rightContent } = useTopbar()
  if (!rightContent) return null
  return <div className="flex items-center mr-2">{rightContent}</div>
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TopbarProvider>
      <DashboardInner>{children}</DashboardInner>
    </TopbarProvider>
  )
}
