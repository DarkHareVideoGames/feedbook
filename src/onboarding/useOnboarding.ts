import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { driver, type Driver } from 'driver.js';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import { renderOnboardingPopover } from './StepPopover';
import { getOnboardingSteps, toDriverSteps, type OnboardingPanel, type OnboardingRole } from './steps';

const ONBOARDING_VERSION = 1;
const LOCAL_COMPLETION_KEY_PREFIX = 'feedbook-admin-onboarding-completed';
const AUTO_STEP_DURATION_MS = 4000;

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
  const [showCompletion, setShowCompletion] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const movingRef = useRef(false);
  const mountedRef = useRef(true);
  const persistenceUnavailableRef = useRef(false);
  const autoAdvanceTimerRef = useRef<number | null>(null);

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

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const stopTour = useCallback(() => {
    clearAutoAdvanceTimer();
    driverRef.current?.destroy();
  }, [clearAutoAdvanceTimer]);

  const getLocalCompletionKey = useCallback(() => (
    userId ? `${LOCAL_COMPLETION_KEY_PREFIX}:v${ONBOARDING_VERSION}:${userId}` : null
  ), [userId]);

  const hasLocalCompletion = useCallback(() => {
    const key = getLocalCompletionKey();
    if (!key) return false;

    try {
      return window.localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  }, [getLocalCompletionKey]);

  const markLocallyCompleted = useCallback(() => {
    const key = getLocalCompletionKey();
    if (!key) return;

    try {
      window.localStorage.setItem(key, 'true');
    } catch {
      // O tutorial continua funcional quando o armazenamento do browser não está disponível.
    }
  }, [getLocalCompletionKey]);

  const startTour = useCallback(async () => {
    if (!userId || !role || steps.length === 0 || isBusy) return;

    const tourSteps = getOnboardingSteps(role);

    setIsBusy(true);
    setShowWelcome(false);
    setShowCompletion(false);
    // A migração pode ainda não estar aplicada num ambiente de desenvolvimento.
    // O tutorial continua disponível; nesse caso apenas não é possível persistir o progresso.
    void saveProgress('in_progress', 0, true);
    if (!mountedRef.current) return;

    setActivePanel(tourSteps[0].panel);
    setSidebarOpen(false);
    movingRef.current = true;

    const scheduleAutoAdvance = (currentIndex: number) => {
      clearAutoAdvanceTimer();
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        const activeTour = driverRef.current;
        if (!activeTour || !activeTour.isActive()) return;

        if (currentIndex >= tourSteps.length - 1) {
          activeTour.destroy();
          if (mountedRef.current) setShowCompletion(true);
          return;
        }

        void saveProgress('in_progress', currentIndex + 1);
        moveTo(currentIndex + 1);
      }, AUTO_STEP_DURATION_MS);
    };

    const moveTo = (targetIndex: number) => {
      const tour = driverRef.current;
      const target = tourSteps[targetIndex];
      if (!tour || !target || movingRef.current) return;

      movingRef.current = true;
      setActivePanel(target.panel);
      setSidebarOpen(false);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (tour.isActive()) tour.moveTo(targetIndex);
          movingRef.current = false;
          scheduleAutoAdvance(targetIndex);
        });
      });
    };

    const tour = driver({
      steps: toDriverSteps(tourSteps),
      animate: !prefersReducedMotion(),
      overlayColor: '#000000',
      overlayOpacity: 0.72,
      smoothScroll: true,
      allowClose: false,
      allowKeyboardControl: false,
      overlayClickBehavior: 'none',
      disableActiveInteraction: true,
      popoverClass: 'feedbook-onboarding-popover',
      showButtons: [],
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      onPopoverRender: renderOnboardingPopover,
      onDestroyStarted: (_element, _step, options) => {
        options.driver.destroy();
      },
      onDestroyed: () => {
        clearAutoAdvanceTimer();
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
        scheduleAutoAdvance(0);
      });
    });
  }, [clearAutoAdvanceTimer, isBusy, role, saveProgress, setActivePanel, setSidebarOpen, steps, userId]);

  const startWelcomeTour = useCallback(() => {
    void startTour();
  }, [startTour]);

  const deferWelcomeTour = useCallback(() => {
    if (isBusy) return;
    setShowWelcome(false);
  }, [isBusy]);

  const confirmCompletion = useCallback(async () => {
    if (isBusy) return;

    setIsBusy(true);
    markLocallyCompleted();
    await saveProgress('completed', steps.length);

    if (mountedRef.current) {
      setShowCompletion(false);
      setIsBusy(false);
    }
  }, [isBusy, markLocallyCompleted, saveProgress, steps.length]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAutoAdvanceTimer();
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [clearAutoAdvanceTimer]);

  useEffect(() => {
    let cancelled = false;

    if (!userId || !role) {
      setIsReady(true);
      setShowWelcome(false);
      setShowCompletion(false);
      return undefined;
    }

    persistenceUnavailableRef.current = false;
    setIsReady(false);
    void (async () => {
      const { data, error } = isSupabaseConfigured
        ? await supabase
          .from('admin_onboarding_progress')
          .select('onboarding_version,status,last_step')
          .eq('user_id', userId)
          .maybeSingle<OnboardingProgress>()
        : { data: null, error: null };

      if (cancelled) return;
      if (error || !isSupabaseConfigured) persistenceUnavailableRef.current = true;
      const shouldShowWelcome = !hasLocalCompletion()
        && (!isSupabaseConfigured
          || Boolean(error)
          || !data
          || data.onboarding_version !== ONBOARDING_VERSION
          || data.status !== 'completed');
      setIsReady(true);
      setShowWelcome(shouldShowWelcome);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasLocalCompletion, role, userId]);

  return {
    isReady,
    showWelcome,
    showCompletion,
    isBusy,
    tourActive,
    startTour,
    startWelcomeTour,
    deferWelcomeTour,
    confirmCompletion,
    stopTour,
  };
}