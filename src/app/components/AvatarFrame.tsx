import React from 'react';
import { Sparkles, Flame, Crown, Shield } from 'lucide-react';

interface AvatarFrameProps {
  src: string;
  alt?: string;
  frameId?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
  showBadge?: boolean;
  isFounder?: boolean;
}

export const AvatarFrame: React.FC<AvatarFrameProps> = ({
  src,
  alt = 'Avatar',
  frameId,
  size = 'md',
  className = '',
  onClick,
  showBadge = false,
  isFounder = false
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-16 h-16 rounded-2xl',
    xl: 'w-24 h-24 rounded-3xl'
  }[size];

  const badgeSizeClasses = {
    sm: 'w-3 h-3 text-[8px]',
    md: 'w-4 h-4 text-[10px]',
    lg: 'w-5 h-5 text-xs',
    xl: 'w-6 h-6 text-xs'
  }[size];

  // Determine frame styling
  let frameGlowClass = 'border border-white/10';
  let auraEffect = null;

  if (frameId === 'frame-crimson') {
    frameGlowClass = 'border-2 border-[#C81E3A] shadow-[0_0_20px_rgba(200,30,58,0.6)] animate-pulse';
    auraEffect = (
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#C81E3A] via-red-600 to-amber-600 opacity-75 blur-sm -z-10 animate-pulse" />
    );
  } else if (frameId === 'frame-gold') {
    frameGlowClass = 'border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)]';
    auraEffect = (
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-600 opacity-80 blur-sm -z-10 animate-pulse" />
    );
  } else if (frameId === 'frame-cyber') {
    frameGlowClass = 'border-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]';
    auraEffect = (
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 opacity-75 blur-sm -z-10 animate-pulse" />
    );
  } else if (frameId === 'frame-violet') {
    frameGlowClass = 'border-2 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)]';
    auraEffect = (
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500 opacity-75 blur-sm -z-10 animate-pulse" />
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative inline-block flex-shrink-0 ${onClick ? 'cursor-pointer group' : ''} ${className}`}
    >
      {auraEffect}
      <div className={`relative overflow-hidden bg-[#17171A] ${sizeClasses} ${frameGlowClass} transition-all duration-300`}>
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </div>

      {showBadge && isFounder && (
        <div className={`absolute -top-1 -right-1 ${badgeSizeClasses} rounded-full bg-amber-500 text-black font-bold flex items-center justify-center shadow-md shadow-amber-500/50 border border-black z-10`}>
          <Crown className="w-2.5 h-2.5" />
        </div>
      )}
    </div>
  );
};
