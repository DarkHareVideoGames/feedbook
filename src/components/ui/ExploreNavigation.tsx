import { useEffect } from 'react';

export default function ExploreNavigation() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('public-explore');
    return () => {
      root.classList.remove('public-explore');
    };
  }, []);

  return null;
}