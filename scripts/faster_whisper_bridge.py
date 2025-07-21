#!/usr/bin/env python3
"""
Faster-Whisper Bridge for WhisperAPI
Provides a Python interface for faster-whisper transcription
"""

import sys
import json
import argparse
import os
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({
        "error": "faster-whisper not installed. Run: pip install faster-whisper"
    }))
    sys.exit(1)

def transcribe_audio(model_path, audio_path, device="cpu", compute_type="int8", 
                    language=None, translate=False):
    """
    Transcribe audio using faster-whisper
    
    Args:
        model_path: Model name or path (e.g., 'large-v3', 'medium')
        audio_path: Path to audio file
        device: 'cpu' or 'cuda'
        compute_type: 'int8', 'int16', 'float16', 'float32'
        language: Language code (e.g., 'pt', 'en') or None for auto-detection
        translate: Whether to translate to English
    
    Returns:
        dict: Transcription result with text and metadata
    """
    try:
        # Initialize the model
        model = WhisperModel(model_path, device=device, compute_type=compute_type)
        
        # Transcribe the audio
        segments, info = model.transcribe(
            audio_path,
            language=language if language != 'auto' else None,
            task="translate" if translate else "transcribe",
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Extract text and word-level timestamps
        full_text = ""
        words = []
        
        for segment in segments:
            full_text += segment.text + " "
            if hasattr(segment, 'words') and segment.words:
                for word in segment.words:
                    words.append({
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability
                    })
        
        return {
            "text": full_text.strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "words": words
        }
        
    except Exception as e:
        return {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description='Faster-Whisper Bridge')
    parser.add_argument('--model', required=True, help='Model name or path')
    parser.add_argument('--audio', required=True, help='Audio file path')
    parser.add_argument('--device', default='cpu', help='Device: cpu or cuda')
    parser.add_argument('--compute_type', default='int8', help='Compute type')
    parser.add_argument('--language', help='Language code or auto')
    parser.add_argument('--translate', action='store_true', help='Translate to English')
    
    args = parser.parse_args()
    
    # Check if audio file exists
    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"Audio file not found: {args.audio}"}))
        sys.exit(1)
    
    # Perform transcription
    result = transcribe_audio(
        model_path=args.model,
        audio_path=args.audio,
        device=args.device,
        compute_type=args.compute_type,
        language=args.language,
        translate=args.translate
    )
    
    # Output JSON result
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()