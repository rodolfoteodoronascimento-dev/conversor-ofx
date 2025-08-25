
import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './icons';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [disabled, onFileSelect]);

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const baseClasses = "relative block w-full rounded-lg border-2 border-dashed p-12 text-center transition-colors duration-300";
  const idleClasses = "border-gray-600 hover:border-sky-500 cursor-pointer";
  const draggingClasses = "border-sky-400 bg-sky-900/30";
  const disabledClasses = "border-gray-700 bg-gray-800/50 cursor-not-allowed opacity-50";

  const getDynamicClasses = () => {
    if (disabled) return disabledClasses;
    if (isDragging) return draggingClasses;
    return idleClasses;
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      className={`${baseClasses} ${getDynamicClasses()}`}
    >
      <div className="flex flex-col items-center justify-center space-y-4 text-gray-400">
        <UploadIcon className="h-12 w-12" />
        <span className="mt-2 block text-sm font-semibold text-white">
          Drop your statement here
        </span>
        <p className="text-xs">or click to browse</p>
        <p className="text-xs text-gray-500">PDF, CSV, or TXT files</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept=".pdf,.csv,.txt"
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
};

export default FileUploader;
