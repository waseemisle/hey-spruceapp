'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, Send } from 'lucide-react';

export default function TestEmailPage() {
  const [email, setEmail] = useState('waseemisle@gmail.com');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const sendTestEmail = async () => {
    setSending(true);
    setResult(null);

    try {
      const response = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: email }),
      });

      const data = await response.json();
      setResult(data);

      if (response.ok) {
        if (data.testMode) {
          toast.warning('Test mode: Email logged to console (SMTP not configured)');
        } else {
          toast.success('Test email sent successfully!');
        }
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (error: any) {
      toast.error('Error: ' + error.message);
      setResult({ error: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl">Test Email Sender</CardTitle>
            <p className="text-gray-600 mt-2">
              Test your Nodemailer configuration with matthew@heyspruce.com
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="email">Recipient Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2"
              />
            </div>

            <Button
              onClick={sendTestEmail}
              disabled={sending || !email}
              className="w-full"
              size="lg"
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'Sending...' : 'Send Test Email'}
            </Button>

            {result && (
              <div className={`p-4 rounded-lg ${
                result.success
                  ? result.testMode
                    ? 'bg-yellow-50 border-2 border-yellow-200'
                    : 'bg-green-50 border-2 border-green-200'
                  : 'bg-red-50 border-2 border-red-200'
              }`}>
                <h3 className={`font-bold mb-2 ${
                  result.success
                    ? result.testMode
                      ? 'text-yellow-800'
                      : 'text-green-800'
                    : 'text-red-800'
                }`}>
                  {result.success
                    ? result.testMode
                      ? '⚠️ Test Mode'
                      : '✅ Success'
                    : '❌ Error'}
                </h3>

                <div className="text-sm space-y-1">
                  {result.success && (
                    <>
                      <p><strong>From:</strong> matthew@heyspruce.com</p>
                      <p><strong>To:</strong> {email}</p>
                      <p><strong>Subject:</strong> Test Email from Hey Spruce - Nodemailer Setup</p>
                      {result.testMode && (
                        <div className="mt-3 p-3 bg-yellow-100 rounded">
                          <p className="text-yellow-900">
                            <strong>Note:</strong> SMTP is not configured. Email was logged to the console instead of being sent.
                          </p>
                          <p className="text-yellow-900 mt-2 text-xs">
                            To send real emails, configure SMTP_* environment variables in .env.local
                          </p>
                        </div>
                      )}
                      {!result.testMode && result.messageId && (
                        <p className="mt-2"><strong>Message ID:</strong> {result.messageId}</p>
                      )}
                    </>
                  )}
                  {result.error && (
                    <p className="text-red-700">{result.error}</p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
              <h4 className="font-bold text-blue-900 mb-2">📋 SMTP Configuration</h4>
              <p className="text-sm text-blue-800 mb-2">
                Add these variables to your <code className="bg-blue-100 px-1 rounded">.env.local</code> file:
              </p>
              <pre className="bg-blue-900 text-blue-100 p-3 rounded text-xs overflow-x-auto">
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=matthew@heyspruce.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM_EMAIL=matthew@heyspruce.com`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
