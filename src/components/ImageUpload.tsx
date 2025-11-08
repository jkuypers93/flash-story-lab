import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  onImageSelect: (file: File | null) => void;
}

export const ImageUpload = ({ onImageSelect }: ImageUploadProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.match(/image\/(jpeg|jpg|png)/)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onImageSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = () => {
    setPreview(null);
    onImageSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png"
        onChange={handleChange}
        className="hidden"
      />
      
      {!preview ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-all duration-200
            ${isDragging 
              ? "border-primary bg-primary/5" 
              : "border-border hover:border-primary/50 hover:bg-muted/50"
            }
          `}
        >
          <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-foreground font-medium mb-1">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-muted-foreground">
            JPG, JPEG or PNG
          </p>
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden border border-border">
          <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
          <Button
            size="icon"
            variant="destructive"
            className="absolute top-2 right-2"
            onClick={(e) => {
              e.stopPropagation();
              clearImage();
            }}
          >
            <X className="w-4 h-4" />
          </Button>
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Image uploaded</span>
          </div>
        </div>
      )}
    </div>
  );
};
