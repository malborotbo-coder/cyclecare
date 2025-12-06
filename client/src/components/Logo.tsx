import logoImage from "@assets/1_1764502393151.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-32 h-32",
  xl: "w-40 h-40",
};

export default function Logo({ size = "md", className = "", showText = false, clickable = true, onClick }: LogoProps) {
  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    } else if (clickable) {
      window.location.href = "/";
    }
  };

  return (
    <div 
      className={`flex items-center gap-3 ${className} ${clickable ? 'cursor-pointer' : ''}`} 
      data-testid="logo-cyclecarelogo"
      onClick={handleClick}
    >
      <img
        src={logoImage}
        alt="Cycle Care Logo"
        className={`${sizeClasses[size]} object-contain drop-shadow-lg`}
        data-testid="img-logo"
      />
    </div>
  );
}
