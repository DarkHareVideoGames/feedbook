import type { DriveStep } from 'driver.js';

export type OnboardingRole = 'superuser' | 'admin' | 'collaborator' | 'technician';
export type OnboardingPanel = 'unified' | 'finance' | 'contact-requests' | 'users' | 'rooms' | 'services';

export type OnboardingStep = {
  id: string;
  panel: OnboardingPanel;
  selector: string;
  title: string;
  description: string;
  sidebarOpen?: boolean;
  clickPanel?: OnboardingPanel;
  sidebarAfterClick?: boolean;
};

const privilegedSteps: OnboardingStep[] = [
  {
    id: 'live-availability',
    panel: 'unified',
    selector: '[data-onboarding="live-availability"]',
    title: 'Ensaios em tempo real',
    description: 'Aqui acompanhas as salas livres, ocupadas e os próximos ensaios. Desliza para baixo para continuar a explorar o painel.',
  },
  {
    id: 'rehearsals',
    panel: 'unified',
    selector: '[data-onboarding="rehearsals"]',
    title: 'Gestão dos ensaios',
    description: 'Filtra o histórico, acompanha pagamentos e abre cada registo para consultar detalhes.',
  },
  {
    id: 'open-contact-menu',
    panel: 'unified',
    selector: '[data-onboarding="mobile-menu-toggle"]',
    title: 'Menu de gestão',
    description: 'Clica em Menu para navegar para outra área do painel.',
    sidebarOpen: false,
    clickPanel: 'unified',
    sidebarAfterClick: true,
  },
  {
    id: 'contact-requests-navigation',
    panel: 'unified',
    selector: '[data-onboarding="contact-requests-navigation"]',
    title: 'Navega nas áreas',
    description: 'Clica em Pedidos de contacto para acompanhar e responder aos pedidos recebidos.',
    sidebarOpen: true,
    clickPanel: 'contact-requests',
    sidebarAfterClick: false,
  },
  {
    id: 'contact-requests',
    panel: 'contact-requests',
    selector: '[data-onboarding="contact-requests"]',
    title: 'Pedidos de contacto',
    description: 'Aqui acompanhas os pedidos recebidos e podes responder a cada contacto.',
  },
  {
    id: 'open-finance-menu',
    panel: 'contact-requests',
    selector: '[data-onboarding="mobile-menu-toggle"]',
    title: 'Menu de gestão',
    description: 'Clica em Menu para abrir novamente as áreas disponíveis.',
    sidebarOpen: false,
    clickPanel: 'contact-requests',
    sidebarAfterClick: true,
  },
  {
    id: 'finance-navigation',
    panel: 'contact-requests',
    selector: '[data-onboarding="finance-navigation"]',
    title: 'Navega nas áreas',
    description: 'Clica em Contas para consultar pagamentos e resumos financeiros.',
    sidebarOpen: true,
    clickPanel: 'finance',
    sidebarAfterClick: false,
  },
  {
    id: 'finance',
    panel: 'finance',
    selector: '[data-onboarding="finance"]',
    title: 'Contas',
    description: 'Aqui acompanhas pagamentos, valores recebidos e resumos financeiros.',
  },
  {
    id: 'open-rooms-menu',
    panel: 'finance',
    selector: '[data-onboarding="mobile-menu-toggle"]',
    title: 'Menu de gestão',
    description: 'Clica em Menu para voltar à navegação.',
    sidebarOpen: false,
    clickPanel: 'finance',
    sidebarAfterClick: true,
  },
  {
    id: 'rooms-navigation',
    panel: 'finance',
    selector: '[data-onboarding="rooms-navigation"]',
    title: 'Navega nas áreas',
    description: 'Clica em Salas para gerir os espaços disponíveis.',
    sidebarOpen: true,
    clickPanel: 'rooms',
    sidebarAfterClick: false,
  },
  {
    id: 'rooms',
    panel: 'rooms',
    selector: '[data-onboarding="rooms"]',
    title: 'Gestão de salas',
    description: 'Aqui crias, editas e activas as salas disponíveis.',
  },
  {
    id: 'open-services-menu',
    panel: 'rooms',
    selector: '[data-onboarding="mobile-menu-toggle"]',
    title: 'Menu de gestão',
    description: 'Clica em Menu para abrir a navegação.',
    sidebarOpen: false,
    clickPanel: 'rooms',
    sidebarAfterClick: true,
  },
  {
    id: 'services-navigation',
    panel: 'rooms',
    selector: '[data-onboarding="services-navigation"]',
    title: 'Navega nas áreas',
    description: 'Clica em Serviços para gerir os extras disponíveis.',
    sidebarOpen: true,
    clickPanel: 'services',
    sidebarAfterClick: false,
  },
  {
    id: 'services',
    panel: 'services',
    selector: '[data-onboarding="services"]',
    title: 'Gestão de serviços',
    description: 'Aqui controlas os serviços extra, preços e disponibilidade.',
  },
  {
    id: 'open-users-menu',
    panel: 'services',
    selector: '[data-onboarding="mobile-menu-toggle"]',
    title: 'Menu de gestão',
    description: 'Clica em Menu para abrir a navegação pela última vez.',
    sidebarOpen: false,
    clickPanel: 'services',
    sidebarAfterClick: true,
  },
  {
    id: 'users-navigation',
    panel: 'services',
    selector: '[data-onboarding="users-navigation"]',
    title: 'Navega nas áreas',
    description: 'Clica em Utilizadores para gerir acessos e permissões.',
    sidebarOpen: true,
    clickPanel: 'users',
    sidebarAfterClick: false,
  },
  {
    id: 'users',
    panel: 'users',
    selector: '[data-onboarding="users"]',
    title: 'Gestão de utilizadores',
    description: 'Cria e atualiza utilizadores, funções e permissões de acesso ao painel.',
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
