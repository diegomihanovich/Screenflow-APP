import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  icon,
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";
  
  const variants = {
    primary: "bg-slate-900 hover:bg-black text-white shadow-lg shadow-slate-900/20 border border-transparent hover:shadow-xl",
    secondary: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm hover:shadow-md hover:text-slate-900",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-transparent hover:border-red-200",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900",
    glass: "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 shadow-lg",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs tracking-wide",
    md: "px-5 py-2.5 text-sm tracking-tight",
    lg: "px-8 py-4 text-base tracking-tight font-semibold",
    icon: "p-2.5",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`} 
      {...props}
    >
      {icon && <span className={`${children ? 'mr-2' : ''}`}>{icon}</span>}
      {children}
    </button>
  );
};