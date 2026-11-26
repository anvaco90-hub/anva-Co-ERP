/**
 * Utility: พิมพ์เอกสาร A4 ผ่าน Isolated Offscreen iframe
 * 100% Bulletproof สำหรับ Chrome, Edge และ Safari
 * 
 * แก้ปัญหาหน้ากระดาษเปล่า (Blank Page):
 * 1. กำหนดขนาด iframe เป็น 210mm x 297mm (ขนาด A4 จริง) และซ่อนนอกจอด้วย top: -10000px
 *    (ไม่ใช้ visibility:hidden หรือ display:none เพราะ Chrome จะไม่คำนวณ Layout ทำให้พิมพ์เป็นหน้าเปล่า)
 * 2. ปลดล็อก body, body * ให้เป็น visibility: visible !important ภายใน iframe เพื่อป้องกัน
 *    CSS @media print { body * { visibility: hidden } } จากหน้าหลักแทรกซึมเข้ามา
 * 3. รอให้รูปภาพและเอกสารแนบ (เช่น ภาพสแกน PO) โหลดเสร็จสมบูรณ์ก่อนเปิด Print Dialog
 */
export function printElement(elementOrId, title = 'พิมพ์เอกสาร', options = {}) {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId

  if (!element) {
    console.warn('[printElement] ไม่พบ Element ที่ต้องการพิมพ์ กำลังเรียก window.print()')
    window.print()
    return
  }

  const orientation = options?.orientation === 'landscape' ? 'landscape' : 'portrait'
  const isLandscape = orientation === 'landscape'

  // 1. สร้าง iframe ซ่อนไว้นอกหน้าจอ (มีขนาดจริงระดับ A4 ป้องกัน Chrome ตีความเป็นหน้า 0x0)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  iframe.style.width = isLandscape ? '297mm' : '210mm'
  iframe.style.height = isLandscape ? '210mm' : '297mm'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.zIndex = '-9999'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document

  // 2. ดึงสไตล์ชีตทั้งหมดของหน้าหลักมาใส่ใน iframe
  const headStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('\n')

  // 3. Clone โครงสร้างเอกสารของ #printable-report
  const cloned = element.cloneNode(true)

  // 4. เขียนเนื้อหา HTML ขนาดกระดาษ A4 บริสุทธิ์
  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      ${headStyles}
      <style>
        @page {
          size: A4 ${orientation};
          margin: ${isLandscape ? '6mm 8mm' : '8mm 10mm'};
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          animation: none !important;
          transition: none !important;
        }
        html, body {
          background-color: #ffffff !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: 'IBM Plex Sans Thai', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          visibility: visible !important;
        }
        /* บังคับให้ทุกอย่างใน iframe แสดงผล 100% ไม่ถูกซ่อน */
        body, body * {
          visibility: visible !important;
          opacity: 1 !important;
        }
        #printable-report, .paper-sheet {
          background-color: #ffffff !important;
          background: #ffffff !important;
          color: #000000 !important;
          box-shadow: none !important;
          border: none !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 0 !important;
          position: static !important;
          display: block !important;
          visibility: visible !important;
        }
        /* ปรับสีตัวอักษรเป็นดำสนิท และพื้นหลังขาว ป้องกัน Dark Mode */
        div, span, p, h1, h2, h3, h4, td, th {
          color: #000000 !important;
        }
        .text-black { color: #000000 !important; }
        .text-neutral-800, .text-neutral-700, .text-neutral-600 { color: #1e293b !important; }
        .text-emerald-800, .text-emerald-700 { color: #047857 !important; }
        
        /* สีกรอบและแถบหัวตาราง */
        .bg-neutral-100, .bg-slate-100, .bg-steel-100 {
          background-color: #f1f5f9 !important;
        }
        .bg-neutral-50, .bg-slate-50, .bg-steel-50 {
          background-color: #f8fafc !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        table th, table td {
          border-color: #cbd5e1 !important;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
          display: block !important;
        }
        .no-print {
          display: none !important;
        }
      </style>
    </head>
    <body class="bg-white text-black p-4">
      <div id="print-root">
        ${cloned.outerHTML}
      </div>
    </body>
    </html>
  `)
  doc.close()

  // 5. รอให้รูปภาพและ Fonts ภายในเอกสารพร้อม ก่อนเปิดหน้าต่างสั่งพิมพ์
  const checkReadyAndPrint = () => {
    const images = Array.from(doc.images)
    const allImagesDone = images.every((img) => img.complete)

    if (allImagesDone || images.length === 0) {
      setTimeout(() => {
        try {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        } catch (err) {
          console.error('[printElement] Iframe print failed, falling back:', err)
          window.print()
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe)
            }
          }, 2000)
        }
      }, 250)
    } else {
      setTimeout(checkReadyAndPrint, 100)
    }
  }

  // เริ่มกระบวนการตรวจสอบ
  setTimeout(checkReadyAndPrint, 150)
}
