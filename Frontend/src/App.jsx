import { useEffect, useMemo, useRef, useState } from 'react'
import "prismjs/themes/prism-tomorrow.css"
import Editor from "react-simple-code-editor"
import prism from "prismjs"
import axios from 'axios'
import Tesseract from 'tesseract.js'
import './App.css'
import { parseReview } from './lib/parseReview'

function App() {
  const [code, setCode] = useState(`function sum(){
  return 1 + 1;
}`)
  const [rawReview, setRawReview] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ocrLoading, setOcrLoading] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState([])

  const parsed = useMemo(() => parseReview(rawReview), [rawReview])

  const lineDiffs = useMemo(() => {
    const diffs = []
    if (!parsed.badCode || !parsed.recommendedFix) return diffs
    const a = parsed.badCode.split('\n')
    const b = parsed.recommendedFix.split('\n')
    const max = Math.max(a.length, b.length)
    for (let i = 0; i < max; i++) {
      const la = (a[i] ?? '').trim()
      const lb = (b[i] ?? '').trim()
      if (la === lb) continue
      if (la && !lb) diffs.push({ type: 'remove', line: i + 1, bad: la })
      else if (!la && lb) diffs.push({ type: 'add', line: i + 1, fix: lb })
      else diffs.push({ type: 'change', line: i + 1, bad: la, fix: lb })
    }
    return diffs
  }, [parsed.badCode, parsed.recommendedFix])

  useEffect(() => {
    prism.highlightAll()
  }, [rawReview])

  const HISTORY_KEY = 'cr_history_v1'
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      if (Array.isArray(saved)) setHistory(saved)
    } catch {}
  }, [])

  function saveHistoryItem(item){
    const next = [item, ...history].slice(0, 50)
    setHistory(next)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
  }

  async function reviewCode() {
    try {
      setError("")
      setLoading(true)
      const response = await axios.post('http://localhost:3000/ai/get-review', { code })
      const text = response.data || ""
      setRawReview(text)
      saveHistoryItem({ id: Date.now(), ts: new Date().toISOString(), code, rawReview: text })
    } catch (e) {
      setError('Failed to fetch review. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text) } catch { /* noop */ }
  }

  function onKeyDown(e){
    // Enter = Review, Shift+Enter = newline
    if (e.key === 'Enter' && !(e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      reviewCode();
      return;
    }
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
      e.preventDefault();
      reviewCode();
    }
  }

  function readAsText(file){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsText(file);
    });
  }

  async function onUploadText(e){
    const f = e.target.files?.[0];
    if(!f) return;
    try{
      const content = await readAsText(f);
      setCode(String(content));
    } finally {
      e.target.value = '';
    }
  }

  async function onUploadImage(e){
    const f = e.target.files?.[0];
    if(!f) return;
    setOcrLoading(true);
    try{
      const imgUrl = URL.createObjectURL(f);
      const { data: { text } } = await Tesseract.recognize(imgUrl, 'eng');
      setCode(text.trim());
    } catch(err){
      setError('Could not extract text from image.');
    } finally{
      setOcrLoading(false);
      e.target.value = '';
    }
  }

  async function onDrop(e){
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if(!f) return;
    if(f.type.startsWith('image/')){
      await onUploadImage({ target: { files: [f] }});
    } else {
      await onUploadText({ target: { files: [f] }});
    }
  }

  function openHistory(){ setHistoryOpen(true) }
  function closeHistory(){ setHistoryOpen(false) }
  function restoreHistory(item){
    setCode(item.code); setRawReview(item.rawReview); setHistoryOpen(false)
  }
  function clearHistory(){ setHistory([]); try { localStorage.removeItem(HISTORY_KEY) } catch {} }

  function getSR(){
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    return Ctor ? new Ctor() : null;
  }

  return (
    <>
      <main>
        <div className="left">
          <div className="left-header">
            <h2>Code</h2>
            <div className="actions">
              <button aria-label="Copy code" className="btn ghost" onClick={() => copyText(code)}>Copy</button>
            </div>
          </div>
          <div className={`code ${ocrLoading ? 'busy' : ''}`} onKeyDown={onKeyDown} onDragOver={(e)=>{e.preventDefault();}} onDrop={onDrop}>
            {ocrLoading && <div className="overlay">Extracting text from image…</div>}
            <Editor
              value={code}
              onValueChange={code => setCode(code)}
              highlight={code => prism.highlight(code, prism.languages.javascript, "javascript")}
              padding={12}
              style={{
                fontFamily: '"Fira Code", "Fira Mono", monospace',
                fontSize: 14,
                borderRadius: "8px",
                height: "100%",
                width: "100%",
                overflow: 'auto'
              }}
            />
          </div>
          <div onClick={reviewCode} className={`review btn ${loading ? 'loading' : ''}`} aria-busy={loading} aria-label="Run review">
            {loading ? 'Reviewing…' : 'Review'}
          </div>

          {/* Bottom-left upload bar */}
          <div className="upload-bar">
            <input id="upload-text" type="file" accept="text/*,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.rb,.go,.rs,.kt,.swift,.php,.html,.css,.json,.md,.txt" style={{display:'none'}} onChange={onUploadText} />
            <input id="upload-image" type="file" accept="image/*" style={{display:'none'}} onChange={onUploadImage} />

            <div className={`fab-menu ${fabOpen ? 'open' : ''}`}>
              <button className="btn ghost small" onClick={()=>document.getElementById('upload-image').click()}>Upload image</button>
              <button className="btn ghost small" onClick={()=>document.getElementById('upload-text').click()}>Upload file</button>
            </div>

            <button className="icon-btn plus" aria-label="Add" onClick={()=>setFabOpen(o=>!o)}>+</button>
            <div className="label">Ask anything</div>
            <div className="spacer" />
            <div className="right-icons" />
          </div>
        </div>

        <div className="right">
          <div className="right-header">
            <h2>AI Code Review</h2>
            <div className="actions">
              <button className="btn ghost small" onClick={openHistory}>History</button>
            </div>
          </div>

          {error && (
            <div className="callout error">{error}</div>
          )}

          {!rawReview && !loading && !error && (
            <div className="placeholder">Run a review to see Issues, a Recommended Fix, and Improvements here.</div>
          )}

          {loading && (
            <div className="skeleton-stack">
              <div className="skeleton title" />
              <div className="skeleton lines" />
              <div className="skeleton title" />
              <div className="skeleton code" />
              <div className="skeleton title" />
              <div className="skeleton lines" />
            </div>
          )}

          {!loading && (rawReview || error) && (
            <div className="sections">
              {parsed.badCode && (
                <section className="section">
                  <div className="section-title danger">✖ Bad Code</div>
                  <pre className="codeblock"><code className="language-javascript">{parsed.badCode}</code></pre>
                </section>
              )}

              {parsed.issues.length > 0 && (
                <section className="section">
                  <div className="section-title danger">Issues</div>
                  <ul className="list">
                    {parsed.issues.map((it, idx) => (
                      <li key={idx}><span className="icon">✖</span>{it}</li>
                    ))}
                  </ul>
                </section>
              )}

              {parsed.recommendedFix && (
                <section className="section">
                  <div className="section-title success">✅ Correct Code</div>
                  <div className="codeblock-wrap">
                    <button className="btn ghost small copy-btn" onClick={() => copyText(parsed.recommendedFix)}>Copy</button>
                    <pre className="codeblock"><code className="language-javascript">{parsed.recommendedFix}</code></pre>
                  </div>
                </section>
              )}

              {lineDiffs.length > 0 && (
                <section className="section">
                  <div className="section-title warn">Line-by-line suggestions</div>
                  <ul className="list">
                    {lineDiffs.map((d, idx) => (
                      <li key={idx}>
                        <span className="icon">📝</span>
                        {d.type === 'change' && (<span>Line {d.line}: replace <code className="inline">{d.bad}</code> with <code className="inline">{d.fix}</code></span>)}
                        {d.type === 'add' && (<span>Line {d.line}: insert <code className="inline">{d.fix}</code></span>)}
                        {d.type === 'remove' && (<span>Line {d.line}: remove <code className="inline">{d.bad}</code></span>)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {parsed.improvements.length > 0 && (
                <section className="section">
                  <div className="section-title warn">Improvements</div>
                  <ul className="list">
                    {parsed.improvements.map((it, idx) => (
                      <li key={idx}><span className="icon">💡</span>{it}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {historyOpen && (
        <div className="history-overlay" onClick={closeHistory}>
          <div className="history-panel" onClick={e=>e.stopPropagation()}>
            <div className="history-header">
              <h3>Past Reviews</h3>
              <div className="spacer" />
              <button className="btn ghost small" onClick={clearHistory}>Clear all</button>
              <button className="btn ghost small" onClick={closeHistory}>Close</button>
            </div>
            {history.length === 0 ? (
              <div className="placeholder">No history yet.</div>
            ) : (
              <ul className="history-list">
                {history.map(item => (
                  <li key={item.id} className="history-item" onClick={()=>restoreHistory(item)}>
                    <div className="time">{new Date(item.ts).toLocaleString()}</div>
                    <pre className="code-preview">{(item.code || '').slice(0, 400)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default App
