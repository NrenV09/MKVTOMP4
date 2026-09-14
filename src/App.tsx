import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { FileVideo, UploadCloud, Loader2, Download, AlertCircle, ArrowRight, Settings2 } from 'lucide-react';

// Use Vite's asset handling to bundle and get URLs for the required files
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import workerURL from '@ffmpeg/ffmpeg/worker?worker&url';

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'remux' | 'transcode'>('remux');
  
  const ffmpegRef = useRef(new FFmpeg());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('Loading FFmpeg started...');
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg log:', message);
      });
      
      ffmpeg.on('progress', ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });
      
      console.log('Calling ffmpeg.load()...');
      await ffmpeg.load({
        coreURL,
        wasmURL,
        classWorkerURL: workerURL,
      });
      console.log('ffmpeg.load() finished.');
      
      setLoaded(true);
    } catch (err: any) {
      console.error('Failed to load FFmpeg', err);
      setError('Failed to load the media conversion engine: ' + (err?.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.mkv')) {
        setError('Please select a valid .mkv file.');
        return;
      }
      setVideoFile(file);
      setOutputUrl(null);
      setProgress(0);
      setError(null);
    }
  };

  const handleConvert = async () => {
    if (!videoFile) return;
    
    setIsConverting(true);
    setError(null);
    setProgress(0);
    setOutputUrl(null);
    
    try {
      const ffmpeg = ffmpegRef.current;
      
      // Write the file to FFmpeg's virtual file system
      await ffmpeg.writeFile('input.mkv', await fetchFile(videoFile));
      
      // Build command based on selected mode
      const command = mode === 'remux' 
        ? ['-i', 'input.mkv', '-c', 'copy', 'output.mp4']
        : ['-i', 'input.mkv', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', 'output.mp4'];
        
      const ret = await ffmpeg.exec(command);
      
      if (ret !== 0) {
        throw new Error('Conversion failed. If Remux failed, try the Transcode mode instead.');
      }
      
      // Read the output file
      const data = await ffmpeg.readFile('output.mp4');
      
      // Create a URL for the output file
      const blob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
    } catch (err: any) {
      console.error('Error during conversion', err);
      setError(err.message || 'An error occurred during conversion.');
    } finally {
      setIsConverting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 text-neutral-900 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-neutral-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
            <FileVideo className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">MKV to MP4 Converter</h1>
            <p className="text-sm text-neutral-500 mt-1">Convert videos locally in your browser. No files are uploaded to any server.</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Engine Loading State */}
          {!loaded ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Initializing WebAssembly Media Engine...</p>
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* File Selection Area */}
              {!videoFile ? (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center py-16 px-6 border-2 border-dashed border-neutral-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/50 transition-colors group cursor-pointer"
                >
                  <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 group-hover:text-blue-500 group-hover:bg-blue-100 transition-colors mb-4">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900">Select an MKV file</h3>
                  <p className="text-sm text-neutral-500 mt-1 text-center max-w-sm">Click to browse your local files. Processing happens entirely on your device.</p>
                </button>
              ) : (
                <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                        <FileVideo className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{videoFile.name}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{formatFileSize(videoFile.size)}</p>
                      </div>
                    </div>
                    {!isConverting && !outputUrl && (
                      <button 
                        onClick={() => {
                          setVideoFile(null);
                          setOutputUrl(null);
                          setProgress(0);
                        }}
                        className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
                      >
                        Change File
                      </button>
                    )}
                  </div>

                  {/* Settings */}
                  {!isConverting && !outputUrl && (
                    <div className="mb-6 p-4 bg-white rounded-xl border border-neutral-200 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        <Settings2 className="w-4 h-4 text-neutral-500" />
                        Conversion Mode
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setMode('remux')}
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            mode === 'remux' 
                              ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' 
                              : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          <div className="text-sm font-medium text-neutral-900">Remux (Copy)</div>
                          <div className="text-xs text-neutral-500 mt-1">Instant. Preserves original video/audio codecs. Fails if codecs are unsupported in MP4.</div>
                        </button>
                        <button
                          onClick={() => setMode('transcode')}
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            mode === 'transcode' 
                              ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' 
                              : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          <div className="text-sm font-medium text-neutral-900">Transcode</div>
                          <div className="text-xs text-neutral-500 mt-1">Slow. Re-encodes to H.264/AAC for maximum compatibility across all devices.</div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Area */}
                  {!outputUrl ? (
                    <div className="mt-4">
                      {isConverting ? (
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm font-medium">
                            <span className="text-blue-600">Converting...</span>
                            <span className="text-neutral-900">{progress}%</span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                              style={{ width: `${progress}%` }} 
                            />
                          </div>
                          {mode === 'transcode' && (
                            <p className="text-xs text-center text-neutral-500 mt-2">Transcoding takes time. Please keep this tab open.</p>
                          )}
                        </div>
                      ) : (
                        <button 
                          onClick={handleConvert}
                          className="w-full py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          Start Conversion <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 pt-6 border-t border-neutral-200 flex flex-col items-center justify-center space-y-4">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                        <Download className="w-6 h-6" />
                      </div>
                      <h3 className="text-lg font-medium text-neutral-900">Conversion Complete</h3>
                      <div className="flex gap-3 w-full">
                        <a 
                          href={outputUrl} 
                          download={`${videoFile.name.replace(/\.[^/.]+$/, "")}.mp4`}
                          className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          Download MP4
                        </a>
                        <button 
                          onClick={() => {
                            setVideoFile(null);
                            setOutputUrl(null);
                            setProgress(0);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="py-3 px-6 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 font-medium rounded-xl transition-colors"
                        >
                          Convert Another
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".mkv" 
        className="hidden" 
      />
    </div>
  );
}
