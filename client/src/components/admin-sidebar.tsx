import { useState } from 'react';
import { 
  Users, 
  Activity, 
  UserPlus, 
  Lock, 
  LogOut, 
  BarChart3,
  Shield,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AdminSidebarProps {
  activePanel: string | null;
  onMenuItemClick: (panel: string) => void;
  onLogout: () => void;
}

export function AdminSidebar({ activePanel, onMenuItemClick, onLogout }: AdminSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    {
      id: 'create-license',
      label: 'Yeni Lisans',
      icon: UserPlus,
      gradient: 'from-orange-500 to-amber-600'
    },
    {
      id: 'stats',
      label: 'İstatistikler',
      icon: BarChart3,
      gradient: 'from-violet-500 to-purple-600'
    },
    {
      id: 'user-activity',
      label: 'Kullanıcı Aktivitesi',
      icon: Users,
      gradient: 'from-green-500 to-emerald-600'
    },
    {
      id: 'activity-logs',
      label: 'Aktivite Logları',
      icon: Activity,
      gradient: 'from-blue-500 to-cyan-600'
    },
    {
      id: 'users-list',
      label: 'Kullanıcı Listesi',
      icon: Shield,
      gradient: 'from-cyan-500 to-teal-600'
    },
    {
      id: 'change-password',
      label: 'Şifre Değiştir',
      icon: Lock,
      gradient: 'from-red-500 to-rose-600'
    }
  ];

  return (
    <div className={`
      ${isOpen ? 'w-64' : 'w-20'}
      bg-gradient-to-b from-gray-950 via-purple-950/30 to-black 
      border-r border-purple-500/20 flex flex-col py-6 relative overflow-hidden
      transition-all duration-300 ease-in-out flex-shrink-0
    `}>
        {/* Background shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,0,255,0.1),transparent_50%)]" />
        
        {/* Logo/Brand + Toggle */}
        <div className={`relative mb-8 ${isOpen ? 'px-4' : 'px-3'} flex items-center justify-between gap-2`}>
          <div className="relative group flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center shadow-lg shadow-purple-500/50 group-hover:shadow-purple-500/80 transition-all duration-300 group-hover:scale-110">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div className="absolute -inset-1 bg-gradient-to-br from-purple-600 to-cyan-600 rounded-xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300" />
          </div>

          {/* Toggle Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`
              relative group w-8 h-8 rounded-lg bg-gray-900/50 hover:bg-purple-600/30 
              transition-all duration-300 flex items-center justify-center
              ${!isOpen && 'ml-auto'}
            `}
            data-testid="sidebar-toggle"
            title={isOpen ? 'Küçült' : 'Genişlet'}
          >
            {isOpen ? (
              <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-purple-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-purple-400" />
            )}
          </button>
        </div>

        {/* Menu Items */}
        <div className={`flex flex-col gap-3 flex-1 ${isOpen ? 'px-3' : 'px-3'}`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePanel === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onMenuItemClick(item.id)}
                className={`
                  relative group rounded-xl transition-all duration-300 flex items-center gap-3
                  ${isOpen ? 'h-12 px-3' : 'h-14 w-14 justify-center'}
                  ${isActive 
                    ? 'bg-gradient-to-br ' + item.gradient + ' shadow-lg scale-105' 
                    : 'bg-gray-900/50 hover:bg-gray-800/70 hover:scale-105'
                  }
                `}
                data-testid={`sidebar-button-${item.id}`}
                title={!isOpen ? item.label : ''}
              >
                {/* Shimmer effect */}
                <div className={`
                  absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500
                  bg-gradient-to-r from-transparent via-white/20 to-transparent
                  animate-shimmer
                `} />
                
                {/* Glow effect for active */}
                {isActive && (
                  <div className={`
                    absolute -inset-1 bg-gradient-to-br ${item.gradient} 
                    rounded-xl opacity-50 blur-lg animate-pulse
                  `} />
                )}
                
                {/* Icon */}
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <Icon className={`
                    w-5 h-5 transition-all duration-300
                    ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}
                  `} />
                </div>

                {/* Label (only when open) */}
                {isOpen && (
                  <span className={`
                    text-sm font-medium whitespace-nowrap transition-all duration-300
                    ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}
                  `}>
                    {item.label}
                  </span>
                )}

                {/* Active indicator */}
                {isActive && !isOpen && (
                  <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-purple-500 to-cyan-500 rounded-l-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Logout Button */}
        <div className={`mt-4 ${isOpen ? 'px-3' : 'px-3'}`}>
          <button
            onClick={onLogout}
            className={`
              relative group rounded-xl bg-gray-900/50 hover:bg-red-900/50 transition-all duration-300 hover:scale-105 flex items-center gap-3
              ${isOpen ? 'h-12 px-3 w-full' : 'h-14 w-14 justify-center'}
            `}
            data-testid="sidebar-button-logout"
            title={!isOpen ? 'Güvenli Çıkış' : ''}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            
            {/* Glow effect on hover */}
            <div className="absolute -inset-1 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-300" />
            
            {/* Icon */}
            <div className="relative flex items-center justify-center flex-shrink-0">
              <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors duration-300" />
            </div>

            {/* Label (only when open) */}
            {isOpen && (
              <span className="text-sm font-medium text-gray-300 group-hover:text-red-400 whitespace-nowrap transition-colors duration-300">
                Güvenli Çıkış
              </span>
            )}
          </button>
        </div>

        {/* Bottom decoration */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 opacity-30" />
    </div>
  );
}
