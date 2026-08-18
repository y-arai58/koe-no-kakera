import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

type Entry = { id: string; date: string; time: string; text: string }
type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } }
type SpeechEventLike = { resultIndex: number; results: ArrayLike<SpeechResultLike> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onstart: (() => void) | null
  onresult: ((event: SpeechEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition
    webkitSpeechRecognition?: new () => Recognition
  }
}

export const Route = createFileRoute('/')({ component: VoiceTimeline })

const STORAGE_KEY = 'koe-no-kakera:entries'
const days = ['日', '月', '火', '水', '木', '金', '土']

const pad = (number: number) => String(number).padStart(2, '0')
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
const dateOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const displayDate = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${days[date.getDay()]}）`

function VoiceTimeline() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [ready, setReady] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [note, setNote] = useState('')
  const [time, setTime] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [notice, setNotice] = useState('')
  const [recording, setRecording] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const recordingRef = useRef(false)
  const finalText = useRef('')
  const initialText = useRef('')
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const updateNow = () => setNow(new Date())
    updateNow()
    const timer = window.setInterval(updateNow, 20_000)
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(saved)) setEntries(saved)
    } catch {
      setNotice('保存済みの記録を読み込めませんでした。新しい記録はこのまま残せます。')
    }
    setReady(true)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      setNotice('保存できませんでした。この画面を閉じると、いまの記録は消えます。')
    }
  }, [entries, ready])

  useEffect(() => () => stopRecording(), [])

  const groupedEntries = useMemo(() => {
    return Object.entries(entries.reduce<Record<string, Entry[]>>((groups, entry) => {
      ;(groups[entry.date] ??= []).push(entry)
      return groups
    }, {})).sort(([a], [b]) => b.localeCompare(a))
  }, [entries])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  const closePanel = () => {
    stopRecording()
    setPanelOpen(false)
  }

  const openPanel = () => {
    const current = new Date()
    if (!note.trim()) setTime(timeOf(current))
    setPanelOpen(true)
    window.setTimeout(() => textarea.current?.focus(), 250)
  }

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setNotice('このブラウザは声の入力に対応していません。このまま文字で書けます。')
      textarea.current?.focus()
      return
    }
    if (recording) return
    const rec = new SpeechRecognition()
    rec.lang = 'ja-JP'
    rec.continuous = true
    rec.interimResults = true
    initialText.current = note.trimEnd() ? `${note.trimEnd()}\n` : ''
    finalText.current = ''
    rec.onstart = () => {
      recordingRef.current = true
      setRecording(true)
      setTime(timeOf(new Date()))
    }
    rec.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalText.current += result[0].transcript
        else interim += result[0].transcript
      }
      setNote(`${initialText.current}${finalText.current}${interim}`)
    }
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setNotice('マイクにつながりませんでした。ブラウザのマイクを許可すると声で残せます。')
        stopRecording()
        return
      }

      if (event.error === 'no-speech') {
        showToast('声が拾えませんでした。聞きなおしています')
        return
      }

      setNotice('音声入力が中断されました。このまま文字で書くこともできます。')
      stopRecording()
    }
    rec.onend = () => {
      if (recognition.current === rec && recordingRef.current) {
        try { rec.start(); return } catch { /* stop below */ }
      }
      setRecording(false)
    }
    recognition.current = rec
    try { rec.start() } catch { setNotice('録音をはじめられませんでした。このまま文字で書けます。') }
  }

  function stopRecording() {
    const rec = recognition.current
    recognition.current = null
    recordingRef.current = false
    setRecording(false)
    if (rec) {
      rec.onend = null
      try { rec.stop() } catch { /* recorder already stopped */ }
    }
  }

  const save = () => {
    const text = note.trim()
    if (!text || !time || !now) return
    setEntries((previous) => [...previous, {
      id: crypto.randomUUID(), date: dateOf(now), time, text,
    }])
    setNote('')
    setTime(timeOf(new Date()))
    closePanel()
    showToast('はりつけました')
  }

  const updateEntry = (id: string, time: string, text: string) => {
    if (!time || !text.trim()) { showToast('時刻と内容を入れてください'); return }
    setEntries((previous) => previous.map((entry) => entry.id === id ? { ...entry, time, text: text.trim() } : entry))
    setEditingId(null)
    showToast('なおしました')
  }

  const copyAll = async () => {
    const text = groupedEntries.slice().reverse().map(([date, list]) =>
      `${date}\n${list.slice().sort((a, b) => a.time.localeCompare(b.time)).map((entry) => `${entry.time}  ${entry.text.replace(/\n/g, '\n       ')}`).join('\n')}`,
    ).join('\n\n')
    try { await navigator.clipboard.writeText(text); showToast('コピーしました') }
    catch { showToast('コピーできませんでした') }
  }

  return (
    <>
      <PaperTexture />
      <header className="sky">
        <span className="sheet"><i className="rim" /><i className="face" /></span>
        <HeaderCutouts />
        <div className="wrap header-content">
          <div className="head-row"><span className="brand">こえのかけら</span><span className="head-date">{now ? displayDate(now) : '—'}</span></div>
          <span className="clock">{now ? timeOf(now).split(':')[0] : '--'}<span className="colon">:</span>{now ? timeOf(now).split(':')[1] : '--'}</span>
        </div>
      </header>

      <main className="wrap timeline" aria-live="polite">
        {!ready || entries.length === 0 ? <EmptyTimeline /> : groupedEntries.map(([date, list]) => <DayTimeline key={date} date={date} entries={list} now={now} editingId={editingId} onEdit={setEditingId} onCancel={() => setEditingId(null)} onSave={updateEntry} onDelete={(id) => { setEntries((previous) => previous.filter((entry) => entry.id !== id)); showToast('はがしました') }} />)}
        {entries.length > 0 && <div className="foot"><button type="button" onClick={copyAll}>文字でコピー</button><button type="button" onClick={() => { if (window.confirm('記録をすべて削除します。元に戻せません。')) { setEntries([]); setEditingId(null); showToast('すべて削除しました') } }}>すべて削除</button></div>}
      </main>

      <button type="button" className={`fab ${panelOpen ? 'hide' : ''}`} onClick={openPanel} aria-label="記録をはじめる"><MicIcon /></button>
      <div className={`backdrop ${panelOpen ? 'on' : ''}`} onClick={closePanel} />
      <section className={`panel ${panelOpen ? 'on' : ''}`} role="dialog" aria-modal="true" aria-label="記録を書く">
        <div className="slip">
          <span className="sheet"><i className="rim" /><i className="face" /></span>
          <div className="slip-bar"><span className="handle" /><button type="button" className="close" onClick={closePanel}>とじる</button></div>
          <div className="slip-top"><button type="button" className={`mic ${recording ? 'rec' : ''}`} onClick={recording ? stopRecording : startRecording} aria-label={recording ? '録音をとめる' : '録音をはじめる'}><MicIcon /></button><div className="time-block"><label className="cap" htmlFor="entry-time">じかん</label><input id="entry-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div><div className={`meter ${recording ? 'on' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></div></div>
          <div className="slip-note"><textarea ref={textarea} value={note} onChange={(event) => setNote(event.target.value)} placeholder="声で入れる、または書く" /></div>
          <div className="slip-actions"><span className={`status ${recording ? 'live' : ''}`}>{recording ? '聞いています　—　もう一度押すと終了' : 'マイクを押すと録音します'}</span><span className="grow" /><button type="button" className="link" onClick={() => setTime(timeOf(new Date()))}>いまの時刻</button><button type="button" className="btn" disabled={!note.trim() || !time} onClick={save}>はりつける</button></div>
          {notice && <div className="notice">{notice}</div>}
        </div>
      </section>
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
      <Ground />
    </>
  )
}

function DayTimeline({ date, entries, now, editingId, onEdit, onCancel, onSave, onDelete }: { date: string; entries: Entry[]; now: Date | null; editingId: string | null; onEdit: (id: string) => void; onCancel: () => void; onSave: (id: string, time: string, text: string) => void; onDelete: (id: string) => void }) {
  const dateValue = new Date(`${date}T00:00:00`)
  const today = now && date === dateOf(now)
  const sorted = [...entries].sort((a, b) => a.time.localeCompare(b.time))
  const hours = [...new Set(sorted.map((entry) => entry.time.slice(0, 2)))]
  return <section className="day"><div className="day-head"><span className={`day-tag ${today ? 'today' : ''}`}>{dateValue.getMonth() + 1}月{dateValue.getDate()}日（{days[dateValue.getDay()]}）{today ? '・きょう' : ''}</span><span className="day-stat"><b>{sorted[0].time}</b> 〜 <b>{sorted.at(-1)?.time}</b>　{sorted.length}枚</span></div><div className="hours">{hours.map((hour) => <div className="hour-row" key={hour}><div className="rail"><span className="pill">{hour}<small>時</small></span><span className="thread" /></div><div className="slots">{sorted.filter((entry) => entry.time.startsWith(hour)).map((entry) => editingId === entry.id ? <EditEntry key={entry.id} entry={entry} onCancel={onCancel} onSave={onSave} /> : <article className="entry" key={entry.id}><span className="entry-time">{entry.time}</span><span className="entry-text">{entry.text}</span><span className="tools"><button type="button" onClick={() => onEdit(entry.id)}>なおす</button><button type="button" className="remove" onClick={() => onDelete(entry.id)}>はがす</button></span></article>)}</div></div>)}</div></section>
}

function EditEntry({ entry, onCancel, onSave }: { entry: Entry; onCancel: () => void; onSave: (id: string, time: string, text: string) => void }) {
  const [time, setTime] = useState(entry.time)
  const [text, setText] = useState(entry.text)
  return <div className="edit"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} /><div className="edit-row"><button type="button" className="btn" onClick={() => onSave(entry.id, time, text)}>なおす</button><button type="button" className="link" onClick={onCancel}>やめる</button></div></div>
}

function EmptyTimeline() { return <div className="empty"><FlowerIcon /><b>まだ一枚もありません</b><span>マイクを押して、いま起きたことを話してください。</span></div> }
function MicIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><rect x="9.25" y="3" width="5.5" height="10.5" rx="2.75" /><path d="M5.5 11.2a6.5 6.5 0 0 0 13 0M12 17.8V21" /></svg> }
function HeaderCutouts() {
  return <>
    <svg className="cut cut-cloud" viewBox="0 0 200 100" aria-hidden="true"><g><path d="M18 78c-14 0-20-9-17-20 2-9 10-13 16-13-1-16 10-28 25-29 12-1 21 5 26 13 6-11 19-18 33-15 15 3 24 15 24 28 12-2 24 5 26 17 2 12-6 21-19 21z" fill="#D8CFBE" transform="translate(1.5,4)" /><path d="M18 78c-14 0-20-9-17-20 2-9 10-13 16-13-1-16 10-28 25-29 12-1 21 5 26 13 6-11 19-18 33-15 15 3 24 15 24 28 12-2 24 5 26 17 2 12-6 21-19 21z" fill="#EFE9DA" /></g></svg>
    <svg className="cut cut-cloud2" viewBox="0 0 120 70" aria-hidden="true"><g><path d="M14 54c-9 0-14-6-12-14 2-7 8-9 12-9-1-11 8-19 18-20 9-1 15 4 19 9 5-8 14-12 23-10 10 2 16 10 16 19 8-1 16 4 17 12 1 8-4 13-13 13z" fill="#75828C" transform="translate(1.2,3.5)" /><path d="M14 54c-9 0-14-6-12-14 2-7 8-9 12-9-1-11 8-19 18-20 9-1 15 4 19 9 5-8 14-12 23-10 10 2 16 10 16 19 8-1 16 4 17 12 1 8-4 13-13 13z" fill="#96A2AB" /></g></svg>
    <svg className="cut cut-star" viewBox="0 0 50 54" aria-hidden="true"><g><path d="M25 1l7 15 17 2-12 12 3 17-15-8-15 8 3-17L1 18l17-2z" fill="#B8862F" transform="translate(1.2,3.5)" /><path d="M25 1l7 15 17 2-12 12 3 17-15-8-15 8 3-17L1 18l17-2z" fill="#D5A24C" /></g></svg>
    <svg className="cut cut-star2" viewBox="0 0 50 54" aria-hidden="true"><g><path d="M25 1l7 15 17 2-12 12 3 17-15-8-15 8 3-17L1 18l17-2z" fill="#B87F72" transform="translate(1.2,3)" /><path d="M25 1l7 15 17 2-12 12 3 17-15-8-15 8 3-17L1 18l17-2z" fill="#D99D93" /></g></svg>
    <svg className="cut cut-heart" viewBox="0 0 40 40" aria-hidden="true"><g><path d="M20 35C7 26 1 19 1 12 1 5 6 1 12 1c4 0 7 2 8 5 1-3 4-5 8-5 6 0 11 4 11 11 0 7-6 14-19 23z" fill="#96422F" transform="translate(1.2,3)" /><path d="M20 35C7 26 1 19 1 12 1 5 6 1 12 1c4 0 7 2 8 5 1-3 4-5 8-5 6 0 11 4 11 11 0 7-6 14-19 23z" fill="#B45C46" /></g></svg>
  </>
}

function FlowerIcon() { return <svg viewBox="0 0 120 120" aria-hidden="true"><g fill="#DCD3C0" transform="translate(2,4)"><ellipse cx="60" cy="24" rx="15" ry="21" /><ellipse cx="60" cy="96" rx="15" ry="21" /><ellipse cx="24" cy="60" rx="21" ry="15" /><ellipse cx="96" cy="60" rx="21" ry="15" /><ellipse cx="34" cy="34" rx="15" ry="20" transform="rotate(-45 34 34)" /><ellipse cx="86" cy="86" rx="15" ry="20" transform="rotate(-45 86 86)" /><ellipse cx="86" cy="34" rx="20" ry="15" transform="rotate(-45 86 34)" /><ellipse cx="34" cy="86" rx="20" ry="15" transform="rotate(-45 34 86)" /></g><g fill="#F0EADB"><ellipse cx="60" cy="24" rx="15" ry="21" /><ellipse cx="60" cy="96" rx="15" ry="21" /><ellipse cx="24" cy="60" rx="21" ry="15" /><ellipse cx="96" cy="60" rx="21" ry="15" /><ellipse cx="34" cy="34" rx="15" ry="20" transform="rotate(-45 34 34)" /><ellipse cx="86" cy="86" rx="15" ry="20" transform="rotate(-45 86 86)" /><ellipse cx="86" cy="34" rx="20" ry="15" transform="rotate(-45 86 34)" /><ellipse cx="34" cy="86" rx="20" ry="15" transform="rotate(-45 34 86)" /></g><circle cx="60" cy="60" r="17" fill="#D5A24C" /></svg> }

function PaperTexture() {
  return <>
    <svg className="defs" aria-hidden="true"><filter id="torn-a" x="-15%" y="-40%" width="130%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.035" numOctaves="5" seed="17" result="n" /><feGaussianBlur in="n" stdDeviation="0.7" result="nb" /><feDisplacementMap in="SourceGraphic" in2="nb" scale="15" xChannelSelector="R" yChannelSelector="G" result="d" /><feGaussianBlur in="d" stdDeviation="0.45" /></filter><filter id="torn-b" x="-15%" y="-40%" width="130%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.007 0.04" numOctaves="5" seed="3" result="n" /><feGaussianBlur in="n" stdDeviation="0.6" result="nb" /><feDisplacementMap in="SourceGraphic" in2="nb" scale="12" xChannelSelector="R" yChannelSelector="G" result="d" /><feGaussianBlur in="d" stdDeviation="0.4" /></filter><filter id="torn-c" x="-12%" y="-25%" width="124%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="4" seed="29" result="n" /><feGaussianBlur in="n" stdDeviation="0.5" result="nb" /><feDisplacementMap in="SourceGraphic" in2="nb" scale="8" xChannelSelector="R" yChannelSelector="G" result="d" /><feGaussianBlur in="d" stdDeviation="0.35" /></filter><filter id="torn-d" x="-12%" y="-25%" width="124%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.055" numOctaves="4" seed="8" result="n" /><feGaussianBlur in="n" stdDeviation="0.45" result="nb" /><feDisplacementMap in="SourceGraphic" in2="nb" scale="6.5" xChannelSelector="R" yChannelSelector="G" result="d" /><feGaussianBlur in="d" stdDeviation="0.3" /></filter><filter id="relief"><feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="5" seed="11" result="t" /><feDiffuseLighting in="t" lightingColor="#ffffff" surfaceScale="1.7"><feDistantLight azimuth="228" elevation="62" /></feDiffuseLighting></filter></svg>
    <svg className="tex tex-relief" preserveAspectRatio="none" aria-hidden="true"><rect width="100%" height="100%" filter="url(#relief)" /></svg><div className="tex tex-grain" /><div className="tex tex-mottle" /><div className="tex tex-streak" />
  </>
}

function Ground() {
  return <div className="ground" aria-hidden="true"><i className="g1" /><i className="g2" /><i className="g3" /><i className="tx" />
    <svg className="plant p1" viewBox="0 0 120 130"><g stroke="#7C8767" strokeWidth="3.5" fill="none" strokeLinecap="round"><path d="M60 128V52" /><path d="M60 92C44 92 32 82 30 68c16-2 28 8 30 24z" fill="#8B9779" stroke="none" /><path d="M60 74c15 0 27-9 29-23-16-2-27 7-29 23z" fill="#7E8B6A" stroke="none" /></g><g><path d="M60 8c8 0 14 7 14 15s-6 15-14 15-14-7-14-15S52 8 60 8z" fill="#C79086" transform="translate(1.5,3)" /></g><g fill="#D99D93"><ellipse cx="60" cy="16" rx="9" ry="12" /><ellipse cx="60" cy="46" rx="9" ry="12" /><ellipse cx="45" cy="31" rx="12" ry="9" /><ellipse cx="75" cy="31" rx="12" ry="9" /><ellipse cx="49" cy="20" rx="9" ry="11" transform="rotate(-45 49 20)" /><ellipse cx="71" cy="42" rx="9" ry="11" transform="rotate(-45 71 42)" /><ellipse cx="71" cy="20" rx="11" ry="9" transform="rotate(-45 71 20)" /><ellipse cx="49" cy="42" rx="11" ry="9" transform="rotate(-45 49 42)" /></g><circle cx="60" cy="31" r="7.5" fill="#F0EADB" /></svg>
    <svg className="plant p2" viewBox="0 0 120 130"><g stroke="#7C8767" strokeWidth="3.5" fill="none" strokeLinecap="round"><path d="M60 128V56" /><path d="M60 96c16 0 28-9 30-23-16-2-28 7-30 23z" fill="#8B9779" stroke="none" /><path d="M60 78c-15 0-27-9-29-23 16-2 27 7 29 23z" fill="#7E8B6A" stroke="none" /></g><g fill="#D5A24C"><ellipse cx="60" cy="20" rx="9" ry="13" /><ellipse cx="60" cy="50" rx="9" ry="13" /><ellipse cx="45" cy="35" rx="13" ry="9" /><ellipse cx="75" cy="35" rx="13" ry="9" /><ellipse cx="49" cy="24" rx="9" ry="12" transform="rotate(-45 49 24)" /><ellipse cx="71" cy="46" rx="9" ry="12" transform="rotate(-45 71 46)" /><ellipse cx="71" cy="24" rx="12" ry="9" transform="rotate(-45 71 24)" /><ellipse cx="49" cy="46" rx="12" ry="9" transform="rotate(-45 49 46)" /></g><circle cx="60" cy="35" r="8" fill="#C97A4E" /></svg>
  </div>
}
