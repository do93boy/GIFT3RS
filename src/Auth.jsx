import { useState } from "react"
import { supabase } from "./lib/supabase"

export default function Auth({ onLogin }) {
  const [tab, setTab] = useState("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailSent, setEmailSent] = useState(false)

  const S = {
    inp: { width:"100%", padding:"13px 16px", borderRadius:13, background:"#101026", border:"1.5px solid #1E1E3A", color:"#EEEEFF", fontSize:14, marginBottom:12, outline:"none", fontFamily:"inherit", transition:"border .2s" },
    btn: { width:"100%", padding:"15px", borderRadius:14, border:"none", fontWeight:900, fontSize:16, cursor:"pointer", fontFamily:"inherit" },
  }

  const handleLogin = async () => {
    setLoading(true); setError("")
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else onLogin(data.user)
    setLoading(false)
  }

  const handleSignup = async () => {
    if (!username.trim()) { setError("Please enter a username"); return }
    setLoading(true); setError("")
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        username: username.toLowerCase().replace(/\s/g,""),
        display_name: username,
      })
    }
    setEmailSent(true)
    setLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true); setError("")
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  if (emailSent) return (
    <div style={{ textAlign:"center", padding:"20px 0" }}>
      <div style={{ fontSize:64, marginBottom:16 }}>📧</div>
      <div style={{ fontFamily:"Exo 2", fontSize:22, fontWeight:900, color:"#EEEEFF", marginBottom:10 }}>Check Your Email!</div>
      <p style={{ color:"#6868A8", fontSize:14, lineHeight:1.7, marginBottom:20 }}>
        We sent a confirmation link to<br/>
        <span style={{ color:"#00E5FF", fontWeight:700 }}>{email}</span><br/><br/>
        Click the link in the email to activate your account, then come back here and log in.
      </p>
      <div style={{ background:"#00E5A015", border:"1px solid #00E5A030", borderRadius:14, padding:"14px", marginBottom:20 }}>
        <div style={{ color:"#00E5A0", fontWeight:700, fontSize:13 }}>✅ Account created for <strong>{username}</strong></div>
        <div style={{ color:"#6868A8", fontSize:12, marginTop:4 }}>Check your spam folder if you don't see it</div>
      </div>
      <button onClick={()=>{setEmailSent(false);setTab("login");}}
        style={{...S.btn, background:"linear-gradient(135deg,#00E5FF,#4DA6FF)", color:"#06060F"}}>
        Go to Log In
      </button>
    </div>
  )

  return (
    <div>
      {/* Google Sign In */}
      <button onClick={handleGoogle} disabled={googleLoading}
        style={{ width:"100%", padding:"13px", borderRadius:14, border:"1.5px solid #2A2A50", background:googleLoading?"#101026":"#14142E", color:"#EEEEFF", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:16, transition:"all .2s" }}
        onMouseEnter={e=>e.currentTarget.style.borderColor="#00E5FF"}
        onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A50"}>
        {/* Google SVG logo */}
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {googleLoading ? "Redirecting..." : "Continue with Google"}
      </button>

      {/* Divider */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <div style={{ flex:1, height:1, background:"#1E1E3A" }}/>
        <span style={{ color:"#6868A8", fontSize:12, fontWeight:600 }}>or</span>
        <div style={{ flex:1, height:1, background:"#1E1E3A" }}/>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", background:"#101026", borderRadius:14, padding:4, marginBottom:20 }}>
        {["login","signup"].map(t => (
          <button key={t} onClick={() => { setTab(t); setError(""); }}
            style={{ flex:1, padding:"10px", borderRadius:11, border:"none", background:tab===t?"#1E1E3A":"transparent", color:tab===t?"#00E5FF":"#6868A8", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
            {t === "login" ? "Log In" : "Sign Up"}
          </button>
        ))}
      </div>

      {tab === "signup" && (
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={S.inp}/>
      )}
      <input placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={S.inp}/>
      <input placeholder="Password (min 6 characters)" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...S.inp, marginBottom:16 }}/>

      {error && (
        <div style={{ color:"#FF6BAE", fontSize:13, marginBottom:12, textAlign:"center", background:"#FF6BAE15", padding:"10px", borderRadius:10 }}>
          ⚠️ {error}
        </div>
      )}

      <button onClick={tab === "login" ? handleLogin : handleSignup} disabled={loading}
        style={{ ...S.btn, background: loading ? "#1E1E3A" : "linear-gradient(135deg,#00E5FF,#4DA6FF)", color: loading ? "#6868A8" : "#06060F" }}>
        {loading ? "Please wait..." : tab === "login" ? "Log In →" : "Create Account →"}
      </button>
    </div>
  )
}