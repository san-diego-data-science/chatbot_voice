import axios from 'axios';

export interface FormField {
    id: string; // entry.12345
    label: string;
    required: boolean;
    type: string; // text, email, etc.
}

// Hardcoded configuration based on inspected form
export const FORM_FIELDS: FormField[] = [
    {
        id: 'entry.2005620554',
        label: 'Name',
        required: true,
        type: 'text'
    },
    {
        id: 'entry.1045781291',
        label: 'Email',
        required: true,
        type: 'email'
    },
    {
        id: 'entry.1166974658',
        label: 'Phone number',
        required: false,
        type: 'text'
    },
    {
        id: 'entry.839337160',
        label: 'Comments',
        required: false,
        type: 'text'
    }
];

export class GoogleFormHandler {
    private formUrl: string;

    constructor(formUrl: string) {
        this.formUrl = formUrl;
    }

    // Deprecated: No longer fetching dynamically, but keeping method signature compatible if needed
    // or we can remove it. The server uses it. We'll return the hardcoded fields.
    async fetchForm(): Promise<FormField[]> {
        return FORM_FIELDS;
    }

    async submit(data: Record<string, string>, testMode: boolean = false) {
        const submitUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeMLg8CT19TR38gzNso1kf5SnPOitt1-XTSC262addWlBnytQ/formResponse';

        if (testMode) {
            console.log('TEST MODE: Skipping submission. Payload:', data);
            return;
        }

        try {
            await axios.post(submitUrl, new URLSearchParams(data), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            console.log('Form submitted successfully.');
        } catch (error) {
            console.error('Error submitting form:', error);
            throw error;
        }
    }
}
