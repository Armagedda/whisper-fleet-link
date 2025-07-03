import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnimatePresence, motion } from 'framer-motion';

/*
Usage Example:
```tsx
import JoinTokenModal from '@/components/JoinTokenModal';

function MyComponent() {
  const [showModal, setShowModal] = useState(false);
  
  const handleSubmit = (token: string) => {
    console.log('Join token:', token);
    // Handle the join token submission
    setShowModal(false);
  };
  
  const handleCancel = () => {
    setShowModal(false);
  };
  
  return (
    <JoinTokenModal
      visible={showModal}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
```
*/

interface JoinTokenModalProps {
  visible: boolean;
  onSubmit: (token: string) => void;
  onCancel: () => void;
}

const JoinTokenModal = ({
  visible,
  onSubmit,
  onCancel,
}) => {
  const [token, setToken] = React.useState('');
  const [error, setError] = React.useState('');

  // Clear input and error when modal visibility changes
  React.useEffect(() => {
    if (!visible) {
      setToken('');
      setError('');
    }
  }, [visible]);

  const handleSubmit = () => {
    const trimmedToken = token.trim();
    
    if (!trimmedToken) {
      setError('Please enter a join token');
      return;
    }

    setError('');
    onSubmit(trimmedToken);
    setToken('');
  };

  const handleCancel = () => {
    setToken('');
    setError('');
    onCancel();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const isSubmitDisabled = !token.trim();

  return (
    <AnimatePresence>
      {visible && (
        <Dialog open={visible} onOpenChange={(open) => !open && handleCancel()}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, type: 'spring' }}
          >
            <DialogContent className="sm:max-w-md w-full max-w-[95vw] mx-auto my-auto rounded-xl shadow-2xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 backdrop-blur-xl border border-border p-6 flex flex-col gap-6 focus:outline-none">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-foreground">Join Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="join-token" className="text-base font-medium">Enter Join Token</Label>
                  <Input
                    id="join-token"
                    type="text"
                    aria-label="Join token input"
                    placeholder="Enter your join token here..."
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      if (error) setError('');
                    }}
                    onKeyPress={handleKeyPress}
                    className={`w-full px-3 py-2 rounded-lg border ${error ? 'border-destructive' : 'border-input'} focus:ring-2 focus:ring-primary/50 focus:outline-none bg-background dark:bg-zinc-800 text-foreground transition-all`}
                    autoFocus
                  />
                  {error && (
                    <p className="text-sm font-medium text-destructive bg-destructive/10 rounded px-2 py-1 mt-1" role="alert">{error}</p>
                  )}
                </div>
              </div>
              <DialogFooter className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  aria-label="Cancel join"
                  className="rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/50"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled}
                  aria-label="Join channel"
                  className="rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/50"
                >
                  Join Channel
                </Button>
              </DialogFooter>
            </DialogContent>
          </motion.div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};

export default JoinTokenModal; 