import React, { useState, useRef, useEffect } from 'react'

function ColorPicker({ value, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false)
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [lightness, setLightness] = useState(50)
  const [isDraggingSV, setIsDraggingSV] = useState(false)
  const [isDraggingHue, setIsDraggingHue] = useState(false)
  
  const svPickerRef = useRef(null)
  const hueSliderRef = useRef(null)
  const pickerRef = useRef(null)

  useEffect(() => {
    const hex = value.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16) / 255
    const g = parseInt(hex.substr(2, 2), 16) / 255
    const b = parseInt(hex.substr(4, 2), 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min

    let h = 0
    let s = 0
    let l = (max + min) / 2

    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
      
      switch (max) {
        case r:
          h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
          break
        case g:
          h = ((b - r) / delta + 2) / 6
          break
        case b:
          h = ((r - g) / delta + 4) / 6
          break
      }
    }

    setHue(Math.round(h * 360))
    setSaturation(Math.round(s * 100))
    setLightness(Math.round(l * 100))
  }, [value])

  const hslToHex = (h, s, l) => {
    s /= 100
    l /= 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((h / 60) % 2 - 1))
    const m = l - c / 2

    let r = 0, g = 0, b = 0

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c
    } else if (h >= 300 && h < 360) {
      r = c; g = 0; b = x
    }

    const toHex = (n) => {
      const hex = Math.round((n + m) * 255).toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  const updateColor = (newHue, newSat, newLight) => {
    const hex = hslToHex(newHue, newSat, newLight)
    onChange(hex)
  }

  const handleSVPickerMove = (e) => {
    if (!svPickerRef.current) return
    
    const rect = svPickerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
    
    const newSat = Math.round((x / rect.width) * 100)
    const newLight = Math.round(100 - (y / rect.height) * 100)
    
    setSaturation(newSat)
    setLightness(newLight)
    updateColor(hue, newSat, newLight)
  }

  const handleHueSliderMove = (e) => {
    if (!hueSliderRef.current) return
    
    const rect = hueSliderRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const newHue = Math.round((x / rect.width) * 360)
    
    setHue(newHue)
    updateColor(newHue, saturation, lightness)
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingSV) {
        handleSVPickerMove(e)
      } else if (isDraggingHue) {
        handleHueSliderMove(e)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingSV(false)
      setIsDraggingHue(false)
    }

    if (isDraggingSV || isDraggingHue) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDraggingSV, isDraggingHue, hue, saturation, lightness])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="position-relative" ref={pickerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 50,
          height: 40,
          backgroundColor: value,
          border: '2px solid #334155',
          borderRadius: 8,
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      />
      
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 8,
            padding: 16,
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1000,
            width: 280
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div
              ref={svPickerRef}
              onMouseDown={(e) => {
                setIsDraggingSV(true)
                handleSVPickerMove(e)
              }}
              style={{
                width: '100%',
                height: 200,
                position: 'relative',
                borderRadius: 8,
                cursor: 'crosshair',
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${saturation}%`,
                  top: `${100 - lightness}%`,
                  width: 16,
                  height: 16,
                  border: '3px solid white',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)',
                  pointerEvents: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div
              ref={hueSliderRef}
              onMouseDown={(e) => {
                setIsDraggingHue(true)
                handleHueSliderMove(e)
              }}
              style={{
                width: '100%',
                height: 16,
                borderRadius: 8,
                cursor: 'pointer',
                position: 'relative',
                background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${(hue / 360) * 100}%`,
                  top: '50%',
                  width: 20,
                  height: 20,
                  border: '3px solid white',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)',
                  pointerEvents: 'none',
                  backgroundColor: `hsl(${hue}, 100%, 50%)`
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                width: 40,
                height: 40,
                backgroundColor: value,
                borderRadius: 8,
                border: '1px solid #334155',
                flexShrink: 0
              }}
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#f1f5f9',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ColorPicker
