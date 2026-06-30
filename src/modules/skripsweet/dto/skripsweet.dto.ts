import {
  IsString, IsOptional, IsDateString, IsArray, IsNumber, IsInt, IsBoolean, Min, Max,
} from 'class-validator';

// ─── Thesis Project ───────────────────────────────────────────

export class CreateThesisDto {
  @IsString() title: string;
  @IsOptional() @IsString() university?: string;
  @IsOptional() @IsString() faculty?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() supervisor?: string;
  @IsOptional() @IsString() supervisorTwo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsString() abstract?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateThesisDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() university?: string;
  @IsOptional() @IsString() faculty?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() supervisor?: string;
  @IsOptional() @IsString() supervisorTwo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsString() abstract?: string;
  @IsOptional() @IsString() notes?: string;
}

// ─── Format Template ──────────────────────────────────────────

export class SetFormatTemplateDto {
  @IsOptional() @IsString() universityName?: string;
  @IsOptional() @IsString() formatRules?: string; // JSON string
  @IsOptional() @IsString() chapterTemplate?: string; // JSON string
  @IsOptional() @IsString() citationStyle?: string;
  @IsOptional() @IsString() customCitation?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() rawUploadText?: string;
}

export class ExplainFormatDto {
  @IsString() explanation: string; // Free-text description of the thesis format
}

// ─── Chapters ─────────────────────────────────────────────────

export class CreateChapterDto {
  @IsString() title: string;
  @IsInt() @Min(0) chapterNum: number;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsInt() targetWords?: number;
  @IsOptional() @IsInt() targetPages?: number;
  @IsOptional() @IsInt() targetParagraphs?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateChapterDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsInt() targetWords?: number;
  @IsOptional() @IsInt() targetPages?: number;
  @IsOptional() @IsInt() targetParagraphs?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ─── Journals / Literature ────────────────────────────────────

export class AddJournalDto {
  @IsString() title: string;
  @IsOptional() @IsString() authors?: string;
  @IsOptional() @IsString() journalName?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() doi?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() abstract?: string;
  @IsOptional() @IsString() relevance?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() bibtex?: string;
  @IsOptional() @IsString() citationKey?: string;
}

export class SearchJournalDto {
  @IsString() query: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) limit?: number;
}

// ─── Bimbingan ────────────────────────────────────────────────

export class CreateBimbinganDto {
  @IsDateString() date: string;
  @IsOptional() @IsString() supervisor?: string;
  @IsString() topic: string;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsString() actionItems?: string; // JSON
  @IsOptional() @IsString() status?: string;
}

export class UpdateBimbinganDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() supervisor?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsString() actionItems?: string;
  @IsOptional() @IsString() status?: string;
}

// ─── Chat ─────────────────────────────────────────────────────

export class ThesisChatDto {
  @IsString() message: string;
  @IsOptional() @IsString() context?: string; // Chapter context
}

// ─── AI Writing Assist ────────────────────────────────────────

export class AiWriteAssistDto {
  @IsString() action: string; // 'continue' | 'expand' | 'rewrite' | 'outline' | 'opening' | 'transition' | 'conclusion' | 'custom'
  @IsOptional() @IsString() selectedText?: string; // Text user has selected
  @IsOptional() @IsString() customPrompt?: string; // For 'custom' action
}

// ─── Bibliography ─────────────────────────────────────────────

export class GenerateBibliographyDto {
  @IsOptional() @IsString() style?: string; // Override citation style
}

export class AddBibliographyEntryDto {
  @IsOptional() @IsString() journalId?: string;
  @IsString() rawEntry: string;
  @IsString() citationKey: string;
  @IsOptional() @IsString() entryType?: string;
}

// ─── Social / Community ───────────────────────────────────────

export class PublishThesisDto {
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class AddCommentDto {
  @IsString() content: string;
}

export class CreateRevisionDto {
  @IsString() note: string;
  @IsOptional() @IsInt() round?: number;
}

export class ExploreQueryDto {
  @IsOptional() @IsString() query?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() university?: string;
}
