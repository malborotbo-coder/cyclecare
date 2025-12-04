import { useState, useEffect, useRef } from 'react';

interface OptimizedImageProps {
  src: string;
  alt?: string;
  className?: string;
  placeholderColor?: string;
  isBackground?: boolean;
  children?: React.ReactNode;
  overlayClassName?: string;
}

export function OptimizedImage({ 
  src, 
  alt = "", 
  className = "", 
  placeholderColor = "bg-muted",
  isBackground = false,
  children,
  overlayClassName = ""
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px', threshold: 0.01 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView) return;

    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.src = src;
  }, [isInView, src]);

  if (isBackground) {
    return (
      <div 
        ref={containerRef}
        className={`relative overflow-hidden ${className}`}
      >
        <div 
          className={`absolute inset-0 transition-opacity duration-500 ${placeholderColor} ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
        />
        <div 
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundImage: isInView ? `url(${src})` : undefined }}
        />
        {overlayClassName && (
          <div className={`absolute inset-0 ${overlayClassName}`} />
        )}
        <div className="relative z-10">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <div 
        className={`absolute inset-0 ${placeholderColor} transition-opacity duration-300 ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
      />
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}

export function HeroSection({
  backgroundImage,
  overlayClassName = "bg-gradient-to-t from-black/80 via-black/50 to-black/30",
  className = "",
  children
}: {
  backgroundImage: string;
  overlayClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <OptimizedImage
      src={backgroundImage}
      isBackground
      className={className}
      overlayClassName={overlayClassName}
      placeholderColor="bg-primary/20"
    >
      {children}
    </OptimizedImage>
  );
}
