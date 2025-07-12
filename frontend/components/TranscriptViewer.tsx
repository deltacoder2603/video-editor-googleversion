'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  FileText, 
  Play, 
  AlertTriangle, 
  CheckCircle,
  Search,
  Volume2,
  VolumeX,
  User,
  Globe,
  Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  ProfanitySegment,
  TranscriptionSegment
} from '@/lib/api';

interface TranscriptEntry {
  index: number;
  text: string;
  confidence: number;
  startSeconds: number;
  endSeconds: number;
  speaker?: string;
  words?: Array<{
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
    speaker?: string;
  }>;
}

interface TranscriptViewerProps {
  transcript: TranscriptEntry[];
  profanitySegments: ProfanitySegment[];
  detectedLanguage?: string;
  languageConfidence?: number;
  onTimeSeek?: (time: number) => void;
  onWordsSelected?: (words: string[]) => void;
  className?: string;
}

export default function TranscriptViewer({
  transcript,
  profanitySegments,
  detectedLanguage,
  languageConfidence,
  onTimeSeek,
  onWordsSelected,
  className
}: TranscriptViewerProps) {
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [showProfanityOnly, setShowProfanityOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSpeakers, setShowSpeakers] = useState(true);

  // Set of all profane words (from backend)
  const profaneWordsSet = new Set(
    profanitySegments.map(ps => ps.word.toLowerCase())
  );

  // Select all profane words
  const selectAllProfaneWords = () => {
    setSelectedWords(new Set(profaneWordsSet));
    onWordsSelected?.(Array.from(profaneWordsSet));
  };

  // Clear all selections
  const clearSelection = () => {
    setSelectedWords(new Set());
    onWordsSelected?.([]);
  };

  // Toggle selection of a word
  const toggleWordSelection = (word: string) => {
    const normalized = word.toLowerCase();
    const newSelected = new Set(selectedWords);
    if (newSelected.has(normalized)) {
      newSelected.delete(normalized);
    } else {
      newSelected.add(normalized);
    }
    setSelectedWords(newSelected);
    onWordsSelected?.(Array.from(newSelected));
  };

  // Unique profane words from backend (normalized)
  const uniqueProfaneWords = Array.from(new Set(profanitySegments.map(ps => (ps.word || '').replace(/[.,/#!$%^&*;:{}=\-_`~()"''"।!?]/g, '').toLowerCase())));

  // Toggle all occurrences of a profane word
  const toggleProfaneWordAll = (word: string) => {
    const normalized = word.toLowerCase();
    const isSelected = selectedWords.has(normalized);
    const newSelected = new Set(selectedWords);
    if (isSelected) {
      // Remove all occurrences
      newSelected.delete(normalized);
    } else {
      // Add all occurrences
      newSelected.add(normalized);
    }
    setSelectedWords(newSelected);
    onWordsSelected?.(Array.from(newSelected));
  };

  // When transcript changes, clear selection (no words selected by default)
  useEffect(() => {
    setSelectedWords(new Set());
    onWordsSelected?.([]);
  }, [transcript]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Highlight logic:
  // - Profane words: light red
  // - Selected words (profane or not): solid red, white text
  // - Non-profane, non-selected: default
  const getWordClassName = (word: string, isProfane: boolean = false, isSelected: boolean = false) => {
    const baseClass = 'px-1 py-0.5 rounded cursor-pointer transition-colors';
    if (isSelected) {
      return `${baseClass} bg-red-600 text-white border border-red-900`;
    }
    if (isProfane) {
      return `${baseClass} bg-red-100 text-red-900 border border-red-300 hover:bg-red-200`;
    }
    return `${baseClass} hover:bg-gray-100 dark:hover:bg-gray-700`;
  };

  const getSpeakerColor = (speaker: string) => {
    const colors = [
      'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
      'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
      'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200',
      'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200',
      'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-200',
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200'
    ];
    const index = speaker.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const filteredTranscript = transcript.filter(entry => {
    if (showProfanityOnly) {
      // Check if this entry contains any profanity
      const hasProfanity = entry.words?.some(w => profaneWordsSet.has(w.word.toLowerCase()));
      if (!hasProfanity) return false;
    }
    if (searchTerm) {
      return entry.text.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <Card className={className + ' shadow-lg border border-gray-200 dark:border-gray-700'}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileText className="w-5 h-5" />
          <span>Transcript & Profanity Detection</span>
          <Badge variant="outline">
            {transcript.length} segments
          </Badge>
        </CardTitle>
        <CardDescription>
          Review transcript and select words to mute
          {detectedLanguage && (
            <span className="ml-2">
              • Language: <strong>{detectedLanguage}</strong>
              {languageConfidence && ` (${Math.round(languageConfidence * 100)}% confidence)`}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 overflow-x-auto">
        {/* Profane Words Detected */}
        {uniqueProfaneWords.length > 0 && (
          <div className="mb-2">
            <div className="font-medium text-red-700 mb-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Profane Words Detected:
            </div>
            <div className="flex flex-wrap gap-2">
              {uniqueProfaneWords.map((word, idx) => (
                <span
                  key={idx}
                  className={
                    'px-2 py-1 rounded-full text-sm font-semibold cursor-pointer border ' +
                    (selectedWords.has(word)
                      ? 'bg-red-600 text-white border-red-900'
                      : 'bg-red-100 text-red-900 border-red-300 hover:bg-red-200')
                  }
                  onClick={() => toggleProfaneWordAll(word)}
                  title={selectedWords.has(word) ? 'Deselect all occurrences' : 'Select all occurrences'}
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Language Detection Info */}
        {detectedLanguage && (
          <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <Globe className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                Language Detected: {detectedLanguage}
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {languageConfidence 
                  ? `Confidence: ${Math.round(languageConfidence * 100)}%`
                  : 'Language automatically detected by AssemblyAI'
                }
              </p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex-1 relative w-full">
              <Input
                placeholder="Search transcript..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 py-2 rounded-full border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-sm bg-white dark:bg-gray-900"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              />
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="profanity-only"
                checked={showProfanityOnly}
                onCheckedChange={setShowProfanityOnly}
              />
              <Label htmlFor="profanity-only" className="text-sm">
                Show profanity only
              </Label>
            </div>
            {transcript.some(entry => entry.speaker) && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-speakers"
                  checked={showSpeakers}
                  onCheckedChange={setShowSpeakers}
                />
                <Label htmlFor="show-speakers" className="text-sm">
                  Show speakers
                </Label>
              </div>
            )}
          </div>

          {/* Selection Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={selectAllProfaneWords}
              size="sm"
              variant="outline"
              className="gap-1"
            >
              <CheckCircle className="w-3 h-3" />
              Select All Profane
            </Button>
            <Button
              onClick={clearSelection}
              size="sm"
              variant="outline"
              className="gap-1"
            >
              <VolumeX className="w-3 h-3" />
              Clear Selection
            </Button>
            <Badge variant="secondary">
              {selectedWords.size} words selected
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Transcript Content */}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {filteredTranscript.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {showProfanityOnly ? 'No profanity found in transcript' : 'No transcript entries found'}
            </div>
          ) : (
            filteredTranscript.map((entry, index) => {
              return (
                <div
                  key={index}
                  className={cn(
                    'p-4 border rounded-lg transition-all hover:shadow-md',
                    entry.words?.some(w => profaneWordsSet.has(w.word.toLowerCase()))
                      ? 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'
                  )}
                >
                  {/* Entry Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="font-mono">
                        #{entry.index + 1}
                      </Badge>
                      {showSpeakers && entry.speaker && (
                        <Badge 
                          variant="outline" 
                          className={getSpeakerColor(entry.speaker)}
                        >
                          <User className="w-3 h-3 mr-1" />
                          {entry.speaker}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {Math.round(entry.confidence * 100)}% confidence
                      </Badge>
                      {entry.words?.some(w => profaneWordsSet.has(w.word.toLowerCase())) && (
                        <Badge variant="destructive" className="text-xs">
                          Profanity detected
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 font-mono">
                        {formatTime(entry.startSeconds)} - {formatTime(entry.endSeconds)}
                      </span>
                      {onTimeSeek && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onTimeSeek(entry.startSeconds)}
                          className="h-6 w-6 p-0"
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Entry Text */}
                  <div className="text-sm leading-relaxed flex flex-wrap gap-1">
                    {entry.text.split(' ').map((word, wordIndex) => {
                      const normalizedWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()"''"।!?]/g, '').toLowerCase();
                      const isProfane = profaneWordsSet.has(normalizedWord);
                      const isSelected = selectedWords.has(normalizedWord);
                      return (
                        <span
                          key={wordIndex}
                          className={getWordClassName(word, isProfane, isSelected)}
                          onClick={() => toggleWordSelection(normalizedWord)}
                          title={isProfane ? 'Profanity detected' : 'Click to select for muting'}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}