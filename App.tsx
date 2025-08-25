import React, { useState, useCallback } from 'react';
import FileUploader from './components/FileUploader';
import { ConversionStatus } from './types';
import { extractTransactionsFromStatement } from './services/geminiService';
import { createOfxContent } from './services/ofxService';
import { FileIcon, CheckCircleIcon, ExclamationTriangleIcon, DownloadIcon } from './components/icons';
import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker for pdf.js to run in the background for better performance
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

const readFileContent = async (fileToRead: File): Promise<string> => {
  if (fileToRead.type === 'application/pdf') {
    try {
      const arrayBuffer = await fileToRead.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      const pagePromises = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        // Start fetching page and its text content in parallel
        pagePromises.push(pdf.getPage(i).then(page => page.getTextContent()));
      }
      
      const textContents = await Promise.all(pagePromises);
      
      let fullText = '';
      textContents.forEach(textContent => {
        const pageText = textContent.items
            .filter(item => 'str' in item && item.str.trim().length > 0)
            .map(item => ('str' in item ? item.str : ''))
            .join(' ');
        fullText += pageText + '\n\n'; // Add newlines between pages for clarity
      });

      if (!fullText.trim()) {
        throw new Error("Could not extract any text from the PDF. It might be an image-based PDF without selectable text.");
      }
      
      return fullText;
    } catch (error) {
        console.error("Error processing PDF:", error);
        if (error instanceof Error && error.name === 'PasswordException') {
            throw new Error("The PDF file is password-protected. Please provide an unprotected file.");
        }
        throw new Error("Failed to process the PDF file. It may be corrupted or in an unsupported format.");
    }
  } else if (fileToRead.type === 'text/csv' || fileToRead.type === 'text/plain' || fileToRead.name.endsWith('.txt')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error("Failed to read file content."));
        }
      };
      reader.onerror = (error) => {
        reject(new Error(`File reading error: ${error.type}`));
      };
      reader.readAsText(fileToRead, 'UTF-8');
    });
  } else {
    throw new Error(`Unsupported file type: '${fileToRead.type || 'unknown'}'. Please upload a PDF, CSV, or TXT file.`);
  }
};


const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ConversionStatus>(ConversionStatus.Idle);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to convert your file.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ofxContent, setOfxContent] = useState<string | null>(null);

  const resetState = () => {
    setFile(null);
    setStatus(ConversionStatus.Idle);
    setStatusMessage('Ready to convert your file.');
    setErrorMessage(null);
    setOfxContent(null);
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setStatus(ConversionStatus.Processing);
    setErrorMessage(null);
    setOfxContent(null);
    setStatusMessage('Reading file...');

    try {
      const fileContent = await readFileContent(selectedFile);

      // Smartly detect if the file is already in OFX format.
      if (fileContent.trim().startsWith('OFXHEADER:')) {
          setOfxContent(fileContent);
          setStatus(ConversionStatus.Success);
          setStatusMessage('Success! This file is already in OFX format.');
          return;
      }

      const onProgress = (message: string) => {
        setStatusMessage(message);
      };

      const transactions = await extractTransactionsFromStatement(fileContent, selectedFile.name, onProgress);
      
      if(transactions.length === 0) {
        throw new Error("No transactions could be found in the document. Please check the file content and try again.");
      }

      const ofxResult = createOfxContent(transactions);
      setOfxContent(ofxResult);
      setStatus(ConversionStatus.Success);
      setStatusMessage(`Success! ${transactions.length} transactions converted.`);
    } catch (err) {
      const error = err as Error;
      console.error('Conversion failed:', error);
      setStatus(ConversionStatus.Error);
      setErrorMessage(error.message || 'An unknown error occurred.');
    }
  };
  
  const handleDownload = () => {
    if (!ofxContent || !file) return;
    const blob = new Blob([ofxContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
    a.download = `${baseName}.ofx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const renderStatusDisplay = () => {
    if (status === ConversionStatus.Idle || !file) return null;

    return (
        <div className="w-full mt-6 p-6 bg-gray-800/60 border border-gray-700 rounded-lg flex flex-col items-center text-center">
            <div className="flex items-center space-x-3 text-white">
                <FileIcon className="h-6 w-6 text-gray-400" />
                <span className="font-medium">{file.name}</span>
            </div>
            
            {status === ConversionStatus.Processing && (
                <div className="mt-4 flex items-center space-x-3 text-sky-400">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-400"></div>
                    <p>{statusMessage}</p>
                </div>
            )}

            {status === ConversionStatus.Success && (
                <div className="mt-4 flex flex-col items-center space-y-4">
                    <div className="flex items-center space-x-2 text-green-400">
                        <CheckCircleIcon className="h-6 w-6"/>
                        <p>{statusMessage}</p>
                    </div>
                    <button onClick={handleDownload} className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300">
                        <DownloadIcon className="h-5 w-5" />
                        <span>Download .ofx File</span>
                    </button>
                </div>
            )}

            {status === ConversionStatus.Error && (
                 <div className="mt-4 flex flex-col items-center space-y-4">
                    <div className="flex items-center space-x-2 text-red-400">
                        <ExclamationTriangleIcon className="h-6 w-6"/>
                        <p className="font-semibold">Conversion Failed</p>
                    </div>
                    <p className="text-sm text-gray-300 max-w-md">{errorMessage}</p>
                    <button onClick={resetState} className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300">
                        Try Again
                    </button>
                </div>
            )}
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-slate-800 text-white flex flex-col items-center justify-center p-4 sm:p-6">
      <main className="w-full max-w-2xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl shadow-black/30 p-8 text-center">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-cyan-300">
              AI OFX Converter
            </h1>
            <p className="mt-3 text-lg text-gray-300 max-w-md mx-auto">
              Instantly convert your PDF, CSV, and TXT statements to OFX with AI.
            </p>
            <div className="mt-8">
              <FileUploader onFileSelect={handleFileSelect} disabled={status === ConversionStatus.Processing} />
            </div>
        </div>
        {renderStatusDisplay()}
      </main>
      <footer className="text-center mt-8 text-gray-500 text-sm">
        <p>Powered by Gemini AI. For best results with PDF files, please use documents with selectable text.</p>
      </footer>
    </div>
  );
};

export default App;
