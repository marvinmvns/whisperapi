#!/usr/bin/env python3
"""
Insanely Fast Whisper Bridge for WhisperAPI
Provides a Python interface for insanely-fast-whisper transcription using transformers pipeline
"""

import sys
import json
import argparse
import os
import tempfile
from pathlib import Path

try:
    import torch
    from transformers import pipeline, AutoModelForSpeechSeq2Seq, AutoProcessor
    import librosa
    import numpy as np
except ImportError:
    print(json.dumps({
        "error": "Required dependencies not installed. Run: pip install torch transformers librosa numpy"
    }))
    sys.exit(1)

def transcribe_audio(model_path, audio_path, device="auto", torch_dtype="auto", 
                    language=None, translate=False, batch_size=24, chunk_length_s=30,
                    return_timestamps=True):
    """
    Transcribe audio using insanely-fast-whisper (transformers pipeline)
    
    Args:
        model_path: Model name or path (e.g., 'openai/whisper-large-v3-turbo')
        audio_path: Path to audio file
        device: 'auto', 'cpu', 'cuda', or specific device
        torch_dtype: 'auto', 'float16', 'float32', 'bfloat16'
        language: Language code (e.g., 'pt', 'en') or None for auto-detection
        translate: Whether to translate to English
        batch_size: Batch size for processing
        chunk_length_s: Chunk length in seconds
        return_timestamps: Whether to return word-level timestamps
    
    Returns:
        dict: Transcription result with text and metadata
    """
    try:
        # Determine device
        if device == "auto":
            if torch.cuda.is_available():
                device = "cuda:0"
                torch_dtype = torch.float16 if torch_dtype == "auto" else getattr(torch, torch_dtype)
            else:
                device = "cpu"
                torch_dtype = torch.float32 if torch_dtype == "auto" else getattr(torch, torch_dtype)
        else:
            torch_dtype = torch.float32 if torch_dtype == "auto" else getattr(torch, torch_dtype)

        # Load model and processor
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_path, 
            torch_dtype=torch_dtype, 
            low_cpu_mem_usage=True, 
            use_safetensors=True
        )
        model.to(device)
        
        processor = AutoProcessor.from_pretrained(model_path)

        # Create pipeline
        pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            max_new_tokens=128,
            chunk_length_s=chunk_length_s,
            batch_size=batch_size,
            return_timestamps=return_timestamps,
            torch_dtype=torch_dtype,
            device=device,
        )

        # Set generation parameters
        generate_kwargs = {
            "task": "translate" if translate else "transcribe",
            "language": language if language and language != 'auto' else None,
        }

        # Load and process audio
        audio_data, sample_rate = librosa.load(audio_path, sr=16000)
        
        # Run transcription
        result = pipe(audio_data, generate_kwargs=generate_kwargs)
        
        # Extract information
        text = result["text"].strip()
        chunks = result.get("chunks", [])
        
        # Process chunks for word-level timestamps
        words = []
        if chunks and return_timestamps:
            for chunk in chunks:
                if "timestamp" in chunk and chunk["timestamp"]:
                    start_time, end_time = chunk["timestamp"]
                    # For word-level, we'll split the chunk text
                    chunk_words = chunk["text"].strip().split()
                    if chunk_words and start_time is not None and end_time is not None:
                        duration = end_time - start_time if end_time else 0
                        word_duration = duration / len(chunk_words) if chunk_words else 0
                        
                        for i, word in enumerate(chunk_words):
                            word_start = start_time + (i * word_duration)
                            word_end = word_start + word_duration
                            words.append({
                                "word": word,
                                "start": round(word_start, 2),
                                "end": round(word_end, 2),
                                "probability": 0.95  # Approximate confidence
                            })

        # Calculate duration
        duration = len(audio_data) / sample_rate

        # Detect language if not specified
        detected_language = language if language and language != 'auto' else 'pt'
        
        return {
            "text": text,
            "language": detected_language,
            "language_probability": 0.95,  # Approximate confidence
            "duration": duration,
            "words": words,
            "chunks": chunks
        }
        
    except Exception as e:
        return {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description='Insanely Fast Whisper Bridge')
    parser.add_argument('--model', required=True, help='Model name or path')
    parser.add_argument('--audio', required=True, help='Audio file path')
    parser.add_argument('--device', default='auto', help='Device: auto, cpu, cuda, or specific device')
    parser.add_argument('--torch_dtype', default='auto', help='Torch dtype: auto, float16, float32, bfloat16')
    parser.add_argument('--language', help='Language code or auto')
    parser.add_argument('--translate', action='store_true', help='Translate to English')
    parser.add_argument('--batch_size', type=int, default=24, help='Batch size')
    parser.add_argument('--chunk_length_s', type=int, default=30, help='Chunk length in seconds')
    parser.add_argument('--return_timestamps', action='store_true', default=True, help='Return timestamps')
    
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
        torch_dtype=args.torch_dtype,
        language=args.language,
        translate=args.translate,
        batch_size=args.batch_size,
        chunk_length_s=args.chunk_length_s,
        return_timestamps=args.return_timestamps
    )
    
    # Output JSON result
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()