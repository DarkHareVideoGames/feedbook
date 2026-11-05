import { Camera, Globe, PlayCircle } from 'lucide-react';

// Fonte única para os links dos rodapés da página principal e da página 404.
export const FOOTER_LINKS = [
  { id: 'site', href: 'https://www.feedbackproductions.pt', labelKey: 'site', Icon: Globe },
  { id: 'instagram', href: 'https://www.instagram.com/feedbackproductions', labelKey: 'instagram', Icon: Camera },
  { id: 'youtube', href: 'https://www.youtube.com/@feedbackproductions', labelKey: 'youtube', Icon: PlayCircle },
] as const;