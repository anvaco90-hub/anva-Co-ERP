import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 bg-rose-950/60 text-rose-400 rounded-2xl border border-rose-800/80 mx-auto flex items-center justify-center text-2xl shadow-inner">
              </div>
            <div>
              <h2 className="text-lg font-black text-white">เกิดข้อผิดพลาดในการโหลดหน้าเว็บ</h2>
              <p className="text-xs text-slate-400 mt-1">
                ระบบตรวจพบข้อผิดพลาดที่ไม่คาดคิดในการประมวลผลหน้าจอนี้
              </p>
            </div>
            {this.state.error && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-left font-mono text-[11px] text-rose-300 max-h-36 overflow-y-auto break-all">
                {this.state.error.toString()}
              </div>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.href = '/'
                }}
                className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 text-xs font-bold transition cursor-pointer"
              >
                 กลับหน้าหลัก
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-black transition shadow-xs cursor-pointer"
              >
                โหลดหน้าเว็บใหม่
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

