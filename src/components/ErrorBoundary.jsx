import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO_MAIN = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/f4582ad21_Untitleddesign1.png";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Log to console for debugging
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ 
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    // Reload the page to recover
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div 
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            padding: '24px'
          }}
        >
          <div 
            style={{
              maxWidth: '600px',
              width: '100%',
              textAlign: 'center'
            }}
          >
            {/* Logo */}
            <img 
              src={LOGO_MAIN}
              alt="AthletiGo"
              style={{
                width: '150px',
                height: 'auto',
                margin: '0 auto 32px',
                opacity: 0.5
              }}
            />

            {/* Error Icon */}
            <div
              style={{
                width: '80px',
                height: '80px',
                margin: '0 auto 24px',
                borderRadius: '50%',
                backgroundColor: '#FFEBEE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle 
                style={{
                  width: '40px',
                  height: '40px',
                  color: '#f44336'
                }}
              />
            </div>

            {/* Error Message */}
            <h1 
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: '#000000',
                marginBottom: '16px',
                fontFamily: "'Montserrat', 'Heebo', sans-serif"
              }}
            >
              משהו השתבש
            </h1>
            
            <p 
              style={{
                fontSize: '1.125rem',
                color: '#7D7D7D',
                marginBottom: '32px',
                lineHeight: 1.6
              }}
            >
              אנחנו מצטערים, אבל נתקלנו בבעיה טכנית.
              <br />
              נסה לרענן את הדף או לחזור מאוחר יותר.
            </p>

            {/* Error Details (collapsible) */}
            {this.state.error && (
              <details
                style={{
                  marginBottom: '32px',
                  padding: '16px',
                  backgroundColor: '#FAFAFA',
                  borderRadius: '12px',
                  textAlign: 'right',
                  border: '1px solid #E0E0E0'
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#7D7D7D',
                    marginBottom: '8px'
                  }}
                >
                  פרטים טכניים
                </summary>
                <pre
                  style={{
                    fontSize: '12px',
                    color: '#000000',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    textAlign: 'left',
                    direction: 'ltr'
                  }}
                >
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px', margin: '0 auto' }}>
              <Button
                onClick={this.handleReset}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#FF6F20',
                  color: '#FFFFFF',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '16px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <RefreshCw style={{ width: '20px', height: '20px' }} />
                רענן את הדף
              </Button>

              <Button
                onClick={() => window.history.back()}
                variant="outline"
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '16px',
                  border: '1px solid #E0E0E0',
                  cursor: 'pointer'
                }}
              >
                חזור לדף הקודם
              </Button>
            </div>

            {/* Support Info */}
            <p
              style={{
                marginTop: '32px',
                fontSize: '14px',
                color: '#9E9E9E'
              }}
            >
              הבעיה נמשכת? צור קשר עם התמיכה
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}