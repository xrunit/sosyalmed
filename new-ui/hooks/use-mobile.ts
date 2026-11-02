"use client"

import * as React from "react"

/**
 * useIsMobile
 *
 * A small, SSR-safe hook to detect if the current viewport width is
 * at or below a configurable breakpoint (defaults to 768px).
 *
 * Usage:
 * const isMobile = useIsMobile() // uses 768px breakpoint
 * const isMobile = useIsMobile(1024) // uses 1024px breakpoint
 */
export function useIsMobile(breakpoint = 768): boolean {
  const isClient = typeof window !== "undefined" && typeof window.matchMedia === "function"

  const mqString = `(max-width: ${breakpoint}px)`

  const getInitial = React.useCallback(() => {
    if (!isClient) return false
    try {
      return window.matchMedia(mqString).matches
    } catch (e) {
      return false
    }
  }, [isClient, mqString])

  const [isMobile, setIsMobile] = React.useState<boolean>(getInitial)

  React.useEffect(() => {
    if (!isClient) return

    const mql = window.matchMedia(mqString)

    const handler = (ev: MediaQueryListEvent | MediaQueryList) => {
      // Some browsers call listener with MediaQueryList, others with MediaQueryListEvent
      // both expose `.matches`.
      // Use a small microtask to avoid sync layout thrash when called during resize.
      Promise.resolve().then(() => setIsMobile(Boolean((ev as any).matches)))
    }

    // Modern API first, fallback to legacy addListener/removeListener
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler as EventListener)
    } else if (typeof (mql as any).addListener === "function") {
      ;(mql as any).addListener(handler)
    }

    // Set initial state (in case it changed since render)
    setIsMobile(mql.matches)

    return () => {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", handler as EventListener)
      } else if (typeof (mql as any).removeListener === "function") {
        ;(mql as any).removeListener(handler)
      }
    }
  }, [isClient, mqString])

  return isMobile
}

export default useIsMobile
