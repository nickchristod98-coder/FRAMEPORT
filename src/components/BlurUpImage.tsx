import { useState } from 'react';

type BlurUpImageProps = {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
};

/** Lightweight blur-up placeholder while the thumbnail loads. */
export default function BlurUpImage({ src, alt, className = '', onError }: BlurUpImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${className} transition duration-500 ${
        loaded ? 'scale-100 blur-0 opacity-100' : 'scale-[1.02] blur-md opacity-70'
      }`}
      onLoad={() => setLoaded(true)}
      onError={onError}
    />
  );
}
