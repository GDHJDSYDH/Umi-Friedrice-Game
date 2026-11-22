import React from 'react';
import { IngredientConfig, SeasoningId } from '../types';

export const IngredientIcon: React.FC<{
  shape: IngredientConfig['iconShape'];
  size?: number;
}> = ({ shape, size = 36 }) => {
  switch (shape) {
    case 'rice':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M8 26c0 9 7 15 16 15s16-6 16-15H8z" fill="#3b82f6" stroke="#1e3a5f" strokeWidth="2.4" />
          <path d="M10 26c1-8 7-13 14-13s13 5 14 13H10z" fill="#fffaf0" stroke="#c8b38a" strokeWidth="2" />
          <ellipse cx="19" cy="20" rx="2.5" ry="1.4" transform="rotate(-20 19 20)" fill="#f1e4c3" />
          <ellipse cx="26" cy="18" rx="2.5" ry="1.4" transform="rotate(15 26 18)" fill="#f1e4c3" />
          <ellipse cx="31" cy="22" rx="2.3" ry="1.3" transform="rotate(-12 31 22)" fill="#f1e4c3" />
          <ellipse cx="22" cy="23" rx="2.3" ry="1.3" fill="#f1e4c3" />
          <path d="M16 40h16" stroke="#1e3a5f" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'egg':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path
            d="M24 8c-8 0-14 10-14 20 0 7.5 6 12 14 12s14-4.5 14-12c0-10-6-20-14-20z"
            fill="#fff7e6"
            stroke="#c48b3b"
            strokeWidth="2.4"
          />
          <circle cx="24" cy="27" r="7.5" fill="#ffb703" stroke="#d97706" strokeWidth="1.8" />
          <circle cx="21.5" cy="24.5" r="2.2" fill="#fff" opacity="0.7" />
        </svg>
      );
    case 'shrimp':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path
            d="M34 15c-6-6-17-4-21 4-4 7-1 17 7 19 5 1 10-2 11-6-4 0-7-2-7-6 0-4 3-7 7-7 2 0 4 1 5 2l3-4c-1-1-3-2-5-2z"
            fill="#ff8a65"
            stroke="#b73d1d"
            strokeWidth="2.2"
          />
          <path d="M17 18l5 4M14 25l6 1M17 32l5-3" stroke="#fff3e0" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M35 13l6-3-2 7z" fill="#ff5252" stroke="#b73d1d" strokeWidth="1.8" />
        </svg>
      );
    case 'squid':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <circle cx="20" cy="22" r="10" fill="none" stroke="#fce4ec" strokeWidth="6" />
          <circle cx="20" cy="22" r="12.5" fill="none" stroke="#c2185b" strokeWidth="2" />
          <circle cx="20" cy="22" r="7" fill="none" stroke="#c2185b" strokeWidth="1.6" />
          <circle cx="30" cy="29" r="9" fill="none" stroke="#fff0f5" strokeWidth="5.5" />
          <circle cx="30" cy="29" r="11.5" fill="none" stroke="#c2185b" strokeWidth="2" />
          <circle cx="30" cy="29" r="6.3" fill="none" stroke="#c2185b" strokeWidth="1.5" />
        </svg>
      );
    case 'crab':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="8" y="16" width="32" height="16" rx="6" fill="#fff8f0" stroke="#c0392b" strokeWidth="2.2" />
          <path d="M10 16h28c2 0 2 5 0 5H10c-2 0-2-5 0-5z" fill="#ff5252" />
          <path d="M16 16l-3 16M25 16l-3 16M34 16l-3 16" stroke="#ff7043" strokeWidth="2" />
        </svg>
      );
    case 'scallop':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <ellipse cx="24" cy="18" rx="14" ry="8" fill="#fef3c7" stroke="#b45309" strokeWidth="2.2" />
          <path d="M10 18v12c0 4.4 6.3 8 14 8s14-3.6 14-8V18" fill="#f5d076" stroke="#b45309" strokeWidth="2.2" />
          <path d="M16 25v9M24 27v10M32 25v9" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'clam':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M10 29c0-10 6-17 14-17s14 7 14 17c-4 6-10 8-14 8s-10-2-14-8z" fill="#f5cba7" stroke="#935116" strokeWidth="2.2" />
          <path d="M24 12v25M17 15l4 21M31 15l-4 21" stroke="#ca6f1e" strokeWidth="1.6" />
        </svg>
      );
    case 'eel':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="8" y="13" width="32" height="22" rx="6" fill="#8d4925" stroke="#4a220c" strokeWidth="2.2" />
          <path d="M12 18h24M12 24h24M12 30h24" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="17" cy="21" r="1.3" fill="#fef3c7" />
          <circle cx="28" cy="27" r="1.3" fill="#fef3c7" />
          <circle cx="33" cy="20" r="1.3" fill="#fef3c7" />
        </svg>
      );
    case 'sausage':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <ellipse cx="19" cy="22" rx="10" ry="7" transform="rotate(-25 19 22)" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="2.2" />
          <circle cx="17" cy="21" r="2" fill="#fecaca" />
          <circle cx="22" cy="24" r="1.5" fill="#fecaca" />
          <ellipse cx="30" cy="29" rx="10" ry="7" transform="rotate(-25 30 29)" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2.2" />
          <circle cx="28" cy="28" r="2" fill="#fecaca" />
          <circle cx="33" cy="30" r="1.6" fill="#fecaca" />
        </svg>
      );
    case 'bacon':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M8 20c6-6 12 4 18-2s10-2 14 2v12c-4-4-8-4-14 2s-12-4-18 2V20z" fill="#b91c1c" stroke="#6b1111" strokeWidth="2.2" />
          <path d="M9 24c6-5 12 4 17-2s10-2 13 2" stroke="#fde2e2" strokeWidth="3.5" fill="none" />
          <path d="M9 29c6-5 12 4 17-2s10-2 13 2" stroke="#fca5a5" strokeWidth="2" fill="none" />
        </svg>
      );
    case 'charsiu':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="9" y="13" width="16" height="15" rx="4" fill="#a93226" stroke="#5b1510" strokeWidth="2.2" />
          <rect x="22" y="21" width="17" height="15" rx="4" fill="#c0392b" stroke="#5b1510" strokeWidth="2.2" />
          <path d="M12 17h10M25 25h11" stroke="#f5b041" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'chicken':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="10" y="15" width="15" height="14" rx="5" fill="#fdebd0" stroke="#b9770e" strokeWidth="2.2" />
          <rect x="23" y="20" width="15" height="14" rx="5" fill="#fae5d3" stroke="#b9770e" strokeWidth="2.2" />
          <path d="M14 20l6 4M27 25l6 4" stroke="#e59866" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'ham':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="9" y="16" width="14" height="14" rx="3" fill="#f1948a" stroke="#922b21" strokeWidth="2.2" />
          <rect x="24" y="13" width="14" height="14" rx="3" fill="#ec7063" stroke="#922b21" strokeWidth="2.2" />
          <rect x="17" y="24" width="14" height="14" rx="3" fill="#f5b7b1" stroke="#922b21" strokeWidth="2.2" />
        </svg>
      );
    case 'beef':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="10" y="14" width="16" height="15" rx="4" fill="#7b241c" stroke="#420d09" strokeWidth="2.2" />
          <rect x="22" y="20" width="16" height="15" rx="4" fill="#922b21" stroke="#420d09" strokeWidth="2.2" />
          <path d="M13 18c3 2 6 0 9 3M25 24c4 1 6 4 10 2" stroke="#fadbd8" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'mushroom':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M19 25h10v13c0 2-2 3-5 3s-5-1-5-3V25z" fill="#f5efe6" stroke="#6d4c41" strokeWidth="2.2" />
          <path d="M8 26c0-10 7-17 16-17s16 7 16 17c0 3-3 4-16 4S8 29 8 26z" fill="#8d6e63" stroke="#4e342e" strokeWidth="2.2" />
          <path d="M21 15l6 6M27 15l-6 6" stroke="#f5efe6" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'broccoli':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M20 26h8l2 14h-12l2-14z" fill="#82e0aa" stroke="#1e8449" strokeWidth="2.2" />
          <circle cx="16" cy="21" r="8" fill="#27ae60" stroke="#145a32" strokeWidth="2" />
          <circle cx="32" cy="21" r="8" fill="#27ae60" stroke="#145a32" strokeWidth="2" />
          <circle cx="24" cy="15" r="9" fill="#2ecc71" stroke="#145a32" strokeWidth="2" />
          <circle cx="22" cy="13" r="2" fill="#a9dfbf" />
          <circle cx="30" cy="19" r="1.8" fill="#a9dfbf" />
        </svg>
      );
    case 'scallion':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <circle cx="17" cy="20" r="7" fill="#27ae60" stroke="#145a32" strokeWidth="2" />
          <circle cx="17" cy="20" r="3" fill="#d5f5e3" />
          <circle cx="31" cy="22" r="6.5" fill="#2ecc71" stroke="#145a32" strokeWidth="2" />
          <circle cx="31" cy="22" r="2.7" fill="#d5f5e3" />
          <circle cx="23" cy="32" r="7" fill="#229954" stroke="#145a32" strokeWidth="2" />
          <circle cx="23" cy="32" r="3" fill="#d5f5e3" />
        </svg>
      );
    case 'corn':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <circle cx="16" cy="20" r="6" fill="#f4d03f" stroke="#b7950b" strokeWidth="2" />
          <circle cx="28" cy="18" r="6" fill="#f7dc6f" stroke="#b7950b" strokeWidth="2" />
          <circle cx="22" cy="30" r="6.5" fill="#f1c40f" stroke="#b7950b" strokeWidth="2" />
          <circle cx="33" cy="29" r="5.5" fill="#f4d03f" stroke="#b7950b" strokeWidth="2" />
        </svg>
      );
    case 'carrot':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <rect x="10" y="14" width="13" height="13" rx="3" fill="#e67e22" stroke="#935116" strokeWidth="2.2" />
          <rect x="25" y="16" width="13" height="13" rx="3" fill="#f39c12" stroke="#935116" strokeWidth="2.2" />
          <rect x="17" y="25" width="13" height="13" rx="3" fill="#d35400" stroke="#935116" strokeWidth="2.2" />
        </svg>
      );
    case 'pea':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <circle cx="16" cy="21" r="6.5" fill="#52be80" stroke="#196f3d" strokeWidth="2" />
          <circle cx="31" cy="20" r="6.5" fill="#58d68d" stroke="#196f3d" strokeWidth="2" />
          <circle cx="23" cy="31" r="6.5" fill="#27ae60" stroke="#196f3d" strokeWidth="2" />
          <circle cx="14" cy="19" r="1.8" fill="#d5f5e3" />
          <circle cx="29" cy="18" r="1.8" fill="#d5f5e3" />
          <circle cx="21" cy="29" r="1.8" fill="#d5f5e3" />
        </svg>
      );
    case 'onion':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M24 10c-8 4-13 11-13 18 0 6 5.8 11 13 11s13-5 13-11c0-7-5-14-13-18z" fill="#a569bd" stroke="#5b2c6f" strokeWidth="2.2" />
          <path d="M24 14c-5 4-8 9-8 14 0 4 3.5 7 8 7s8-3 8-7c0-5-3-10-8-14z" fill="#e8daef" stroke="#7d3c98" strokeWidth="1.6" />
        </svg>
      );
    case 'lettuce':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48">
          <path d="M12 31c-4-7 0-17 9-19 5-4 13-2 16 4 5 5 3 15-4 18-6 4-16 3-21-3z" fill="#82e0aa" stroke="#1e8449" strokeWidth="2.2" />
          <path d="M18 33c3-6 7-12 12-16M23 26l6 2M20 22l-4-2" stroke="#d5f5e3" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
  }
};

export const SeasoningBottleIcon: React.FC<{ id: SeasoningId; size?: number }> = ({ id, size = 44 }) => {
  switch (id) {
    case 'oil':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="19" y="4" width="10" height="8" rx="2" fill="#d97706" stroke="#78350f" strokeWidth="2" />
          <path d="M17 12h14l4 10v24a6 6 0 0 1-6 6H19a6 6 0 0 1-6-6V22l4-10z" fill="#fde68a" stroke="#92400e" strokeWidth="2.2" />
          <path d="M14 26h20v18a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5V26z" fill="#f59e0b" />
          <rect x="17" y="29" width="14" height="12" rx="3" fill="#fffbeb" stroke="#b45309" strokeWidth="1.4" />
          <text x="24" y="38" textAnchor="middle" fontSize="9" fontWeight="900" fill="#92400e">油</text>
        </svg>
      );
    case 'soy':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="18" y="4" width="12" height="7" rx="2" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
          <path d="M19 11h10l6 14v21a6 6 0 0 1-6 6H19a6 6 0 0 1-6-6V25l6-14z" fill="#451a03" stroke="#1c0a00" strokeWidth="2.2" />
          <rect x="16" y="29" width="16" height="13" rx="3" fill="#fef3c7" stroke="#92400e" strokeWidth="1.4" />
          <text x="24" y="38.5" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7c2d12">酱油</text>
        </svg>
      );
    case 'salt':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="14" y="10" width="20" height="8" rx="3" fill="#60a5fa" stroke="#1d4ed8" strokeWidth="2" />
          <rect x="12" y="18" width="24" height="32" rx="6" fill="#f8fafc" stroke="#475569" strokeWidth="2.2" />
          <rect x="16" y="27" width="16" height="13" rx="3" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.4" />
          <text x="24" y="37" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#1e3a8a">盐</text>
        </svg>
      );
    case 'sugar':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="14" y="10" width="20" height="8" rx="3" fill="#f472b6" stroke="#be185d" strokeWidth="2" />
          <rect x="12" y="18" width="24" height="32" rx="6" fill="#fffbeb" stroke="#9d174d" strokeWidth="2.2" />
          <rect x="16" y="27" width="16" height="13" rx="3" fill="#fce7f3" stroke="#db2777" strokeWidth="1.4" />
          <text x="24" y="37" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#9d174d">糖</text>
        </svg>
      );
    case 'msg':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="15" y="9" width="18" height="8" rx="3" fill="#34d399" stroke="#065f46" strokeWidth="2" />
          <rect x="13" y="17" width="22" height="33" rx="6" fill="#ecfdf5" stroke="#047857" strokeWidth="2.2" />
          <rect x="16" y="27" width="16" height="13" rx="3" fill="#a7f3d0" stroke="#059669" strokeWidth="1.4" />
          <text x="24" y="36.5" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#065f46">味精</text>
        </svg>
      );
    case 'spice':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="16" y="8" width="16" height="8" rx="3" fill="#92400e" stroke="#451a03" strokeWidth="2" />
          <rect x="13" y="16" width="22" height="34" rx="6" fill="#b45309" stroke="#451a03" strokeWidth="2.2" />
          <rect x="16" y="27" width="16" height="13" rx="3" fill="#fef3c7" stroke="#92400e" strokeWidth="1.4" />
          <text x="24" y="36.5" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#78350f">香料</text>
        </svg>
      );
    case 'honey':
      return (
        <svg width={size} height={size} viewBox="0 0 48 56">
          <rect x="15" y="8" width="18" height="7" rx="3" fill="#fbbf24" stroke="#92400e" strokeWidth="2" />
          <path d="M14 15h20c3 5 4 12 4 21 0 9-4 14-14 14S10 45 10 36c0-9 1-16 4-21z" fill="#f59e0b" stroke="#92400e" strokeWidth="2.2" />
          <path d="M14 26c4 3 16 3 20 0" stroke="#fde68a" strokeWidth="2" fill="none" />
          <rect x="16" y="29" width="16" height="13" rx="4" fill="#fffbeb" stroke="#b45309" strokeWidth="1.4" />
          <text x="24" y="38.5" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#b45309">蜂蜜</text>
        </svg>
      );
  }
};
