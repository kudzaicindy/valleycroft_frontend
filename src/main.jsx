import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globalBase.css'
import './index.css'
import '@/styles/Dashboard.css'
import App from './App.jsx'

/* Remotion ad iframe: class before paint; skip StrictMode here to avoid dev double-mount + subtree churn during capture. */
let vcRemotionEmbed = false
try {
  vcRemotionEmbed = new URLSearchParams(window.location.search).get('vc_embed') === '1'
  if (vcRemotionEmbed) {
    document.documentElement.classList.add('vc-remotion-ad')
  }
} catch {
  /* ignore */
}

const app = <App />
createRoot(document.getElementById('root')).render(
  vcRemotionEmbed ? app : <StrictMode>{app}</StrictMode>,
)
