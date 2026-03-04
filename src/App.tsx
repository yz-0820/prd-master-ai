/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Sparkles, 
  Download, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  FilePlus,
  Wand2,
  Trash2,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import Markdown from 'react-markdown';
import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// --- Types ---
type Mode = 'generate' | 'optimize';

interface FileData {
  name: string;
  content: string;
  type: string;
}

// --- AI Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [mode, setMode] = useState<Mode>('generate');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [prototypeImage, setPrototypeImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const newFiles: FileData[] = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      
      const filePromise = new Promise<FileData>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (event) => {
          try {
            let textContent = '';
            if (file.name.endsWith('.docx')) {
              const arrayBuffer = event.target?.result as ArrayBuffer;
              const result = await mammoth.extractRawText({ arrayBuffer });
              textContent = result.value;
            } else if (file.name.endsWith('.pdf')) {
              // PDF extraction is complex in browser, we'll notify the user or use a simpler method
              textContent = "[PDF Content - Extraction limited in browser demo. Please use .docx or .txt for best results.]";
            } else {
              textContent = event.target?.result as string;
            }

            resolve({
              name: file.name,
              content: textContent,
              type: file.type
            });
          } catch (err) {
            reject(err);
          }
        };
        
        if (file.name.endsWith('.docx')) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      });

      try {
        newFiles.push(await filePromise);
      } catch (err) {
        console.error("Error reading file:", err);
        setError(`Failed to read file: ${file.name}`);
      }
    }
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!prompt && files.length === 0) {
      setError("Please provide a prompt or upload a file.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setPrototypeImage(null);

    try {
      const contextText = files.map(f => `File: ${f.name}\nContent: ${f.content}`).join('\n\n');
      
      const systemInstruction = mode === 'generate' 
        ? "You are an expert Product Manager. Generate a comprehensive PRD based on the provided context and prompt. Use professional Markdown formatting. Include sections like: Overview, Goals, User Stories, Functional Requirements, Non-functional Requirements, and Success Metrics."
        : "You are an expert Product Manager. Optimize the provided PRD based on the user's suggestions. Fix inconsistencies, improve clarity, and add missing professional details. Return the full optimized PRD in professional Markdown.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Context/Files:\n${contextText}\n\nUser Prompt: ${prompt}`,
        config: {
          systemInstruction,
        }
      });

      setResult(response.text || "Failed to generate PRD.");
    } catch (err: any) {
      setError(err.message || "An error occurred while processing your request.");
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePrototype = async () => {
    if (!result) return;
    setIsGeneratingImage(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `Based on this PRD, generate a professional UI wireframe/prototype image. Focus on the core user interface described. PRD Content: ${result.substring(0, 2000)}`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });

      for (const part of response.candidates?.[0].content.parts || []) {
        if (part.inlineData) {
          setPrototypeImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (err: any) {
      setError("Failed to generate prototype image: " + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const exportPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(result.replace(/[#*`]/g, ''), 180);
    doc.text(splitText, 10, 10);
    doc.save('PRD_Export.pdf');
  };

  const exportWord = async () => {
    if (!result) return;
    
    const sections = result.split('\n').map(line => {
      if (line.startsWith('# ')) return new Paragraph({ text: line.replace('# ', ''), heading: HeadingLevel.HEADING_1 });
      if (line.startsWith('## ')) return new Paragraph({ text: line.replace('## ', ''), heading: HeadingLevel.HEADING_2 });
      return new Paragraph({ children: [new TextRun(line)] });
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: sections,
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "PRD_Export.docx");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-slate-900 p-2 rounded-lg">
            <Sparkles className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">PRD Master AI</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMode('generate')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${mode === 'generate' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Generate
          </button>
          <button 
            onClick={() => setMode('optimize')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${mode === 'optimize' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Optimize
          </button>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-6xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Source Materials
            </h2>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
            >
              <div className="bg-slate-50 p-3 rounded-full group-hover:bg-blue-100 transition-colors">
                <FilePlus className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
              </div>
              <p className="text-sm text-slate-500 text-center">
                <span className="font-medium text-slate-900">Click to upload</span> or drag and drop<br/>
                PDF, Word, or Text files
              </p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                multiple 
                accept=".pdf,.doc,.docx,.txt"
              />
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="text-sm font-medium truncate text-slate-700">{file.name}</span>
                    </div>
                    <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Instructions
            </h2>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === 'generate' ? "Describe the product features, target audience, and goals..." : "What specific parts of the PRD should be improved?"}
              className="w-full h-40 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-slate-700 leading-relaxed"
            />
            
            <button 
              onClick={handleSubmit}
              disabled={isProcessing}
              className="w-full mt-4 bg-slate-900 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  {mode === 'generate' ? 'Generate PRD' : 'Optimize PRD'}
                </>
              )}
            </button>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Right Column: Result */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {!result && !isProcessing ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200"
              >
                <div className="bg-white p-6 rounded-full shadow-sm mb-6">
                  <FileText className="w-12 h-12 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to Build?</h3>
                <p className="text-slate-500 max-w-xs">
                  Upload your materials and provide instructions to see the AI-crafted PRD here.
                </p>
              </motion.div>
            ) : isProcessing ? (
              <div className="h-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-6" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">Crafting your PRD...</h3>
                <p className="text-slate-500">This might take a few moments as we analyze your requirements.</p>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="font-semibold text-slate-900">Generated PRD</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={exportPDF}
                        className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all flex items-center gap-1 text-xs font-medium"
                        title="Export as PDF"
                      >
                        <FileDown className="w-4 h-4" /> PDF
                      </button>
                      <button 
                        onClick={exportWord}
                        className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all flex items-center gap-1 text-xs font-medium"
                        title="Export as Word"
                      >
                        <FileText className="w-4 h-4" /> Word
                      </button>
                    </div>
                  </div>
                  <div className="p-8 prd-content max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <Markdown>{result}</Markdown>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-blue-500" /> Visual Prototype
                    </h3>
                    {!prototypeImage && !isGeneratingImage && (
                      <button 
                        onClick={generatePrototype}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        Generate Prototype <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isGeneratingImage ? (
                    <div className="aspect-video bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                      <p className="text-sm text-slate-500">Generating wireframe based on PRD...</p>
                    </div>
                  ) : prototypeImage ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
                        <img 
                          src={prototypeImage} 
                          alt="AI Generated Prototype" 
                          className="w-full h-auto"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex justify-end">
                        <a 
                          href={prototypeImage} 
                          download="prototype.png"
                          className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" /> Download Image
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-dashed border-slate-200">
                      <ImageIcon className="w-10 h-10 text-slate-200 mb-2" />
                      <p className="text-sm text-slate-400">No prototype generated yet</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 px-6 text-center text-slate-400 text-xs">
        &copy; 2024 PRD Master AI. Powered by Gemini 3.1 Pro & Flash Image.
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #CBD5E1;
        }
      `}</style>
    </div>
  );
}
