import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const reload = useCallback(() => {
    const mine = ++seq.current
    setLoading(true)
    fnRef.current()
      .then((d) => {
        if (mine !== seq.current) return
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Gagal memuat data')
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false)
      })
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps)

  return { data, error, loading, reload }
}
