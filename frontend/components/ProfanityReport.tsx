'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Volume2, 
  VolumeX,
  Edit3,
  RotateCcw,
  Settings,
  Globe,
  Brain,
  User
} from 'lucide-react';
import { ProfanitySegment } from '@/lib/api';

interface ProfanityReportProps {
  segments: ProfanitySegment[];
  totalDuration: number;
  detectionMethod: string;
  detectedLanguage?: string;
  languageConfidence?: number;
  profanitySources?: string[];
  onSegmentEdit?: (segmentIndex: number, newStart: number, newEnd: number) => void;
  onSegmentRemove?: (segmentIndex: number) => void;
  onContinueWithOriginal?: () => void;
  onContinueWithProcessed?: () => void;
  className?: string;
}

export default function ProfanityReport({
  segments,
  totalDuration,
  detectionMethod,
  detectedLanguage,
  languageConfidence,
  profanitySources = [],
  onSegmentEdit,
  onSegmentRemove,
  onContinueWithOriginal,
  onContinueWithProcessed,
  className
}: ProfanityReportProps) {
  const [showDetails, setShowDetails] = useState(true);
  const [editingSegment, setEditingSegment] = useState<number | null>(null);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(1);
    return `${minutes}:${seconds.padStart(4, '0')}`;
  };

  const getTotalMutedTime = () => {
    return segments.reduce((total, segment) => total + (segment.end - segment.start), 0);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-red-600 bg-red-100 dark:bg-red-900/20';
    if (confidence >= 0.6) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20';
    return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
  };

  const getMethodBadgeColor = (method: string) => {
    switch (method) {
      case 'assemblyai_enhanced':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      case 'allprofanity':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200';
      case 'ai':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      case 'hybrid':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200';
    }
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'assemblyai':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      case 'custom':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200';
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileText className="w-5 h-5" />
          <span>Profanity Detection Report</span>
          {segments.length === 0 ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          )}
        </CardTitle>
        <CardDescription>
          Analysis results using {detectionMethod} detection method
          {detectedLanguage && (
            <span className="ml-2">
              • Detected language: <strong>{detectedLanguage}</strong>
              {languageConfidence && ` (${Math.round(languageConfidence * 100)}% confidence)`}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {/* Profanity Sources Info */}
        {profanitySources.length > 0 && (
          <div className="flex items-center space-x-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <Brain className="w-6 h-6 text-purple-600" />
            <div>
              <h3 className="font-semibold text-purple-800 dark:text-purple-200">
                Detection Sources
              </h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {profanitySources.map((source, index) => (
                  <Badge 
                    key={index}
                    variant="outline" 
                    className={getSourceBadgeColor(source)}
                  >
                    {source === 'assemblyai' ? 'AssemblyAI' : source}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {segments.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Words Found
            </div>
          </div>
          
          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {getTotalMutedTime().toFixed(1)}s
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total Muted
            </div>
          </div>
          
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {((getTotalMutedTime() / totalDuration) * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Video Affected
            </div>
          </div>
          
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {(segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length || 0).toFixed(2)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Avg Confidence
            </div>
          </div>
        </div>

        {/* Detection Status */}
        {segments.length === 0 ? (
          <div className="flex items-center space-x-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <h3 className="font-semibold text-green-800 dark:text-green-200">
                No Inappropriate Content Detected
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                The video appears to be clean based on our {detectionMethod} analysis.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
            <div>
              <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                Inappropriate Content Detected
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Found {segments.length} word{segments.length > 1 ? 's' : ''} that may contain inappropriate language.
              </p>
            </div>
          </div>
        )}

        {/* Show Details Toggle */}
        {segments.length > 0 && (
          <div className="flex items-center space-x-2">
            <Switch
              id="show-details"
              checked={showDetails}
              onCheckedChange={setShowDetails}
            />
            <Label htmlFor="show-details" className="text-sm">
              Show detailed word information
            </Label>
          </div>
        )}

        {/* Detailed Segments List */}
        {segments.length > 0 && showDetails && (
          <div className="space-y-3">
            <h4 className="font-medium flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>Detected Words</span>
            </h4>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {segments.map((segment, index) => (
                <div
                  key={index}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="font-mono">
                        #{index + 1}
                      </Badge>
                      <span className="text-sm font-medium">
                        {segment.word}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getConfidenceColor(segment.confidence)}`}
                      >
                        {Math.round(segment.confidence * 100)}% confidence
                      </Badge>
                      {segment.source && (
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getSourceBadgeColor(segment.source)}`}
                        >
                          {segment.source === 'assemblyai' ? 'AI' : 'Custom'}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {onSegmentEdit && (
                      <Button
                          variant="ghost"
                        size="sm"
                        onClick={() => setEditingSegment(editingSegment === index ? null : index)}
                          className="text-blue-600 hover:text-blue-700"
                      >
                          <Edit3 className="w-4 h-4" />
                      </Button>
                      )}
                      {onSegmentRemove && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSegmentRemove(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <VolumeX className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Volume2 className="w-4 h-4" />
                      <span>{(segment.end - segment.start).toFixed(1)}s</span>
                    </div>
                    </div>
                    
                  {/* Edit Mode */}
                    {editingSegment === index && onSegmentEdit && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`start-${index}`} className="text-xs">Start Time (s)</Label>
                          <Input
                            id={`start-${index}`}
                            type="number"
                            step="0.1"
                            value={segment.start}
                            onChange={(e) => {
                              const newStart = parseFloat(e.target.value);
                              if (!isNaN(newStart) && newStart < segment.end) {
                                onSegmentEdit(index, newStart, segment.end);
                              }
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`end-${index}`} className="text-xs">End Time (s)</Label>
                          <Input
                            id={`end-${index}`}
                            type="number"
                            step="0.1"
                            value={segment.end}
                            onChange={(e) => {
                              const newEnd = parseFloat(e.target.value);
                              if (!isNaN(newEnd) && newEnd > segment.start) {
                                onSegmentEdit(index, segment.start, newEnd);
                              }
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          {onContinueWithOriginal && (
            <Button
              variant="outline"
              onClick={onContinueWithOriginal}
              className="flex-1"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Continue with Original
            </Button>
          )}
          {onContinueWithProcessed && (
            <Button
              onClick={onContinueWithProcessed}
              className="flex-1"
              disabled={segments.length === 0}
            >
              <VolumeX className="w-4 h-4 mr-2" />
              Mute Detected Words
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}