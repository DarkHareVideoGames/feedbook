import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { driver, type Driver } from 'driver.js';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import { renderOnboardingPopover } from './StepPopover';
import { getOnboardingSteps, toDriverSteps, type OnboardingPanel, type OnboardingRole } from './steps';

const ONBOARDING_VERSION = 1;

type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

type OnboardingProgress = {
  onboarding_version: number;
  status: OnboardingStatus;
  last_step: number;
};

type UseOnboardingOptions = {
  userId: string | undefined;
  role: OnboardingRole | undefined;
  setActivePanel: (panel: OnboardingPanel) => void;
  setSidebarOpen: (open: boolean) => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function useOnboarding({ userId, role, setActivePanel, setSidebarOpen }: UseOnboardingOptions) {
  const [isReady, setIsReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const clickCleanupRef = useRef<(() => void) | null>(null);
  const movingRef = useRef(false);
  const mountedRef = useRef(true);
  const persistenceUnavailableRef = useRef(false);

  const steps = useMemo(() => (role ? getOnboardingSteps(role) : []), [role]);

  const saveProgress = useCallback(async (status: OnboardingStatus, lastStep: number, started = false) => {
    if (!userId || !isSupabaseConfigured || persistenceUnavailableRef.current) return false;

    const now = new Date().toISOString();
    const { error } = await supabase.from('admin_onboarding_progress').upsert({
      user_id: userId,
      onboarding_version: ONBOARDING_VERSION,
      status,
      last_step: lastStep,
      ...(started ? { started_at: now } : {}),
      ...(status === 'completed' ? { completed_at: now } : {}),
    }, { onConflict: 'user_id' });

    if (error) {
      // Evita um pedido 404 em cada passo até a migração ser aplicada.
      persistenceUnavailableRef.current = true;
      return false;
    }

    return true;
  }, [userId]);

  const stopTour = useCallback(() => {
    driverRef.current?.destroy();
  }, []);

  const clearTargetClickHandler = useCallback(() => {
    clickCleanupRef.current?.();
    clickCleanupRef.current = null;
  }, []);

  const startTour = useCallback(async () => {
    if (!userId || !role || steps.length === 0 || isBusy) return;

    const tourSteps = getOnboardingSteps(role);

    setIsBusy(true);
    // A migração pode ainda não estar aplicada num ambiente de desenvolvimento.
    // O tutorial continua disponível; nesse caso apenas não é possível persistir o progresso.
    void saveProgress('in_progress', 0, true);
    if (!mountedRef.current) return;

    setShowWelcome(false);
    setActivePanel(tourSteps[0].panel);
    setSidebarOpen(Boolean(tourSteps[0].sidebarOpen));
    movingRef.current = true;

    const moveTo = (targetIndex: number) => {
      const tour = driverRef.current;
      const target = tourSteps[targetIndex];
      if (!tour || !target || movingRef.current) return;

      movingRef.current = true;
      setActivePanel(target.panel);
      setSidebarOpen(Boolean(target.sidebarOpen));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (tour.isActive()) tour.moveTo(targetIndex);
          movingRef.current = false;
        });
      });
    };

    const tour = driver({
      steps: toDriverSteps(tourSteps).map((step, index) => {
        const tourStep = tourSteps[index];
        let removeStepTargetClickHandler: (() => void) | null = null;

        return {
          ...step,
          disableActiveInteraction: tourStep.clickPanel ? false : undefined,
          onHighlighted: (element, _driveStep, options) => {
            clearTargetClickHandler();
            window.requestAnimationFrame(() => {
              const isCurrentStep = options.driver.getActiveIndex() === index;
              document.body.classList.toggle('feedbook-onboarding-action-step', isCurrentStep && Boolean(tourStep.clickPanel));
            });
            if (!tourStep.clickPanel || !(element instanceof HTMLElement)) return;

            const handleClick = (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              clearTargetClickHandler();
              setActivePanel(tourStep.clickPanel!);
              setSidebarOpen(Boolean(tourStep.sidebarAfterClick));
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  if (options.driver.isActive()) options.driver.moveNext();
                });
              });
            };

            element.addEventListener('click', handleClick, true);
            removeStepTargetClickHandler = () => element.removeEventListener('click', handleClick, true);
            clickCleanupRef.current = removeStepTargetClickHandler;
          },
          onDeselected: () => {
            if (clickCleanupRef.current === removeStepTargetClickHandler) clearTargetClickHandler();
          },
        };
      }),
      animate: !prefersReducedMotion(),
      overlayColor: '#000000',
      overlayOpacity: 0.72,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      popoverClass: 'feedbook-onboarding-popover',
      showButtons: ['previous', 'next', 'close'],
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      prevBtnText: 'Anterior',
      nextBtnText: 'Seguinte',
      doneBtnText: 'Começar a usar a app',
      closeBtnLabel: 'Fechar tutorial',
      onPopoverRender: renderOnboardingPopover,
      onNextClick: (_element, _step, options) => {
        const index = options.driver.getActiveIndex() ?? 0;
        if (index >= tourSteps.length - 1) return;
        if (tourSteps[index].clickPanel) return;
        void saveProgress('in_progress', index + 1);
        moveTo(index + 1);
      },
      onPrevClick: (_element, _step, options) => {
        const index = options.driver.getActiveIndex() ?? 0;
        if (index <= 0) return;
        void saveProgress('in_progress', index - 1);
        moveTo(index - 1);
      },
      onDoneClick: (_element, _step, options) => {
        void saveProgress('completed', tourSteps.length);
        options.driver.destroy();
      },
      onCloseClick: (_element, _step, options) => {
        const index = options.driver.getActiveIndex() ?? 0;
        void saveProgress('in_progress', index);
        options.driver.destroy();
      },
      onDestroyStarted: (_element, _step, options) => {
        options.driver.destroy();
      },
      onDestroyed: () => {
        clearTargetClickHandler();
        document.body.classList.remove('feedbook-onboarding-action-step');
        driverRef.current = null;
        movingRef.current = false;
        setSidebarOpen(false);
        if (mountedRef.current) setTourActive(false);
      },
    });

    driverRef.current = tour;
    setTourActive(true);
    setIsBusy(false);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (tour.isActive()) return;
        tour.drive(0);
        movingRef.current = false;
      });
    });
  }, [clearTargetClickHandler, isBusy, role, saveProgress, setActivePanel, setSidebarOpen, steps, userId]);

  const skipWelcome = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    await saveProgress('skipped', 0);
    if (mountedRef.current) {
      setShowWelcome(false);
      setIsBusy(false);
    }
  }, [isBusy, saveProgress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTargetClickHandler();
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!userId || !role || !isSupabaseConfigured) {
      setIsReady(true);
      setShowWelcome(false);
      return undefined;
    }

    persistenceUnavailableRef.current = false;
    setIsReady(false);
    void (async () => {
      const { data, error } = await supabase
        .from('admin_onboarding_progress')
        .select('onboarding_version,status,last_step')
        .eq('user_id', userId)
        .maybeSingle<OnboardingProgress>();

      if (cancelled) return;
      if (error) persistenceUnavailableRef.current = true;
      // Sem a migração, a API devolve 404. Mostramos o modal para o painel
      // continuar utilizável e a persistência passa a funcionar assim que a
      // tabela admin_onboarding_progress for criada.
      const shouldShowWelcome = Boolean(error)
        || !data
        || data.onboarding_version !== ONBOARDING_VERSION
        || data.status === 'not_started';
      setShowWelcome(shouldShowWelcome);
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [role, userId]);

  return {
    isReady,
    isBusy,
    showWelcome,
    tourActive,
    startTour,
    skipWelcome,
    stopTour,
  };
}