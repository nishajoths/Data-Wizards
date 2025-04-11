import { Modal, Button } from 'flowbite-react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  isLoading?: boolean;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Project",
  message = "Are you sure you want to delete this project? This action cannot be undone.",
  isLoading = false
}: DeleteConfirmationModalProps) {
  return (
    <Modal show={isOpen} size="md" onClose={onClose} popup>
        <div className="text-center">
          <HiOutlineExclamationCircle className="mx-auto mb-4 h-14 w-14 text-red-500" />
          <h3 className="mb-5 text-lg font-medium text-gray-800">{title}</h3>
          <p className="text-gray-600 mb-6">
            {message}
          </p>
          <div className="flex justify-center gap-4">
            <Button color="gray" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              color="failure" 
              onClick={onConfirm} 
              disabled={isLoading}
            >
              {isLoading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
    </Modal>
  );
}
