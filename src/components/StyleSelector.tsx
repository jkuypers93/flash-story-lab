import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StyleSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

const STYLES = ["Silly", "Commercial", "Dramatic", "Comedy", "Cinematic"];

export const StyleSelector = ({ value, onValueChange }: StyleSelectorProps) => {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full bg-background">
        <SelectValue placeholder="Select a style" />
      </SelectTrigger>
      <SelectContent className="bg-popover">
        {STYLES.map((style) => (
          <SelectItem key={style} value={style}>
            {style}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
