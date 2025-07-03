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
    <Dialog open={visible} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Channel</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-token">Enter Join Token</Label>
            <Input
              id="join-token"
              type="text"
              placeholder="Enter your join token here..."
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError('');
              }}
              onKeyPress={handleKeyPress}
              className={error ? 'border-destructive' : ''}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
          >
            Join Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinTokenModal; 