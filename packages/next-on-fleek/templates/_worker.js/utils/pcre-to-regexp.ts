export function createPCRE(
	pattern: string,
	namedCaptures: string[] = [],
): PCRE {
	pattern = String(pattern || '').trim();
	const originalPattern = pattern;
	let delim;
	let flags = '';

	// A delimiter can be any non-alphanumeric, non-backslash,
	// non-whitespace character.
	const hasDelim = /^[^a-zA-Z\\\s]/.test(pattern);
	if (hasDelim) {
		delim = pattern[0];
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		const lastDelimIndex = pattern.lastIndexOf(delim);

		// pull out the flags in the pattern
		flags += pattern.substring(lastDelimIndex + 1);

		// strip the delims from the pattern
		pattern = pattern.substring(1, lastDelimIndex);
	}

	// populate namedCaptures array and removed named captures from the `pattern`
	let numGroups = 0;
	pattern = replaceCaptureGroups(pattern, (group: string) => {
		if (/^\(\?[P<']/.test(group)) {
			// PCRE-style "named capture"
			// It is possible to name a subpattern using the syntax (?P<name>pattern).
			// This subpattern will then be indexed in the matches array by its normal
			// numeric position and also by name. PHP 5.2.2 introduced two alternative
			// syntaxes (?<name>pattern) and (?'name'pattern).
			const match = /^\(\?P?[<']([^>']+)[>']/.exec(group);
			if (!match) {
				throw new Error(
					`Failed to extract named captures from ${JSON.stringify(group)}`,
				);
			}
			const capture = group.substring(match[0].length, group.length - 1);
			if (namedCaptures) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				namedCaptures[numGroups] = match[1];
			}
			numGroups++;
			return `(${capture})`;
		}

		if (group.substring(0, 3) === '(?:') {
			// non-capture group, leave untouched
			return group;
		}

		// regular capture, leave untouched
		numGroups++;
		return group;
	});

	// replace "character classes" with their raw RegExp equivalent
	pattern = pattern.replace(
		/\[:([^:]+):\]/g,
		(characterClass: string, name: string) => {
			return characterClasses[name] || characterClass;
		},
	);

	// TODO: convert PCRE-only flags to JS
	// TODO: handle lots more stuff....
	// http://www.php.net/manual/en/reference.pcre.pattern.syntax.php

	return new PCRE(pattern, flags, namedCaptures, originalPattern, flags, delim);
}

/**
 * Invokes `fn` for each "capture group" encountered in the PCRE `pattern`,
 * and inserts the returned value into the pattern instead of the capture
 * group itself.
 *
 * @private
 */
function replaceCaptureGroups(
	pattern: string,
	fn: (group: string) => string,
): string {
	let start = 0;
	let depth = 0;
	let escaped = false;

	for (let i = 0; i < pattern.length; i++) {
		const cur = pattern[i];
		if (escaped) {
			// skip this letter, it's been escaped
			escaped = false;
			continue;
		}
		switch (cur) {
			case '(':
				// we're only interested in groups when the depth reaches 0
				if (depth === 0) {
					start = i;
				}
				depth++;
				break;
			case ')':
				if (depth > 0) {
					depth--;

					// we're only interested in groups when the depth reaches 0
					if (depth === 0) {
						const end = i + 1;
						const l = start === 0 ? '' : pattern.substring(0, start);
						const r = pattern.substring(end);
						const v = String(fn(pattern.substring(start, end)));
						pattern = l + v + r;
						i = start;
					}
				}
				break;
			case '\\':
				escaped = true;
				break;
			default:
				// skip
				break;
		}
	}
	return pattern;
}

export interface CharacterClasses {
	[name: string]: string;
}

export class PCRE extends RegExp {
	namedCaptures: string[];
	pcrePattern: string;
	pcreFlags: string;
	delimiter?: string;

	constructor(
		pattern: string,
		flags: string,
		namedCaptures: string[],
		pcrePattern: string,
		pcreFlags: string,
		delimiter?: string,
	) {
		super(pattern, flags);
		this.namedCaptures = namedCaptures;
		this.pcrePattern = pcrePattern;
		this.pcreFlags = pcreFlags;
		this.delimiter = delimiter;
	}
}

/**
 * Mapping of "character class" names to their JS RegExp equivalent.
 * So that /[:digit:]/ gets converted into /\d/, etc.
 *
 * See: http://en.wikipedia.org/wiki/Regular_expression#Character_classes
 */
export const characterClasses: CharacterClasses = {
	alnum: '[A-Za-z0-9]',
	word: '[A-Za-z0-9_]',
	alpha: '[A-Za-z]',
	blank: '[ \\t]',
	cntrl: '[\\x00-\\x1F\\x7F]',
	digit: '\\d',
	graph: '[\\x21-\\x7E]',
	lower: '[a-z]',
	print: '[\\x20-\\x7E]',
	punct: '[\\]\\[!"#$%&\'()*+,./:;<=>?@\\\\^_`{|}~-]',
	space: '\\s',
	upper: '[A-Z]',
	xdigit: '[A-Fa-f0-9]',
};
