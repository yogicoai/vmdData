'use client';
import { useCallback, useRef, useState } from 'react';

// 간단 토스트 훅: const {toast, ToastEl} = useToast();  toast('저장됨')
export function useToast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef(null);
  const toast = useCallback((m) => {
    setMsg(m);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2100);
  }, []);
  const ToastEl = <div className={'toast' + (show ? ' show' : '')}>{msg}</div>;
  return { toast, ToastEl };
}
