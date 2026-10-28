import type { DriveStep } from 'driver.js';

export type OnboardingRole = 'superuser' | 'admin' | 'collaborator' | 'technician';
export type OnboardingPanel = 'unified' | 'finance' | 'contact-requests' | 'users' | 'rooms' | 'services';

export type OnboardingStep = {
  id: string;
  panel: OnboardingPanel;
  selector: string;
  title: string;
  description: string;
};

const privilegedSteps: OnboardingStep[] = [
  {
    id: 'rehearsals',
    panel: 'unified',
    selector: '[data-onboarding="rehearsals"]',
    title: 'Ensaios',
    description: 'Consulta os ensaios, filtra os registos e abre cada marcação para gerir os detalhes e pagamentos.',
  },
  {
    id: 'contact-requests',
    panel: 'contact-requests',
    selector: '[data-onboarding="contact-requests"]',
    title: 'Pedidos de contacto',
    description: 'Acompanha os pedidos recebidos e responde directamente a cada contacto.',
  },
  {
    id: 'finance',
    panel: 'finance',
    selector: '[data-onboarding="finance"]',
    title: 'Contas',
    description: 'Vê os valores recebidos, pagamentos pendentes e os resumos financeiros.',
  },
  {
    id: 'rooms',
    panel: 'rooms',
    selector: '[data-onboarding="rooms"]',
    title: 'Catálogo',
    description: 'Cria e actualiza as salas. No menu encontras também os Serviços para gerir extras, preços e disponibilidade.',
  },
  {
    id: 'users',
    panel: 'users',
    selector: '[data-onboarding="users"]',
    title: 'Gestão de utilizadores',
    description: 'Cria e actualiza utilizadores, funções e permissões de acesso ao painel. Podes repetir esta explicação através de Ajuda.',
  },
];

export function getOnboardingSteps(role: OnboardingRole): OnboardingStep[] {
  return role === 'admin' || role === 'superuser' ? privilegedSteps : [];
}

export function toDriverSteps(steps: OnboardingStep[]): DriveStep[] {
  return steps.map((step) => ({
    element: step.selector,
    waitForElement: 1200,
    popover: {
      title: step.title,
      description: step.description,
      side: 'bottom',
      align: 'center',
    },
  }));
}
